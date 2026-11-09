import { beforeEach, describe, expect, test } from "bun:test";
import { resetState } from "@/lib/updates/state";
import {
	checkForUpdates,
	getState,
	restartWithUpdate,
	resetUpdateDeps,
	setUpdateDeps,
} from "@/lib/updates/store";

type FakeUpdate = {
	version: string;
	download: (onEvent?: (event: unknown) => void) => Promise<void>;
	install: () => Promise<void>;
	close: () => Promise<void>;
};

function updater(overrides: Partial<FakeUpdate> = {}): FakeUpdate {
	return {
		version: "2.0.0",
		download: async () => {},
		install: async () => {},
		close: async () => {},
		...overrides,
	};
}

function serveUpdate(update: FakeUpdate): void {
	setUpdateDeps({
		checkUpdater: async () => update as never,
		fetchGithub: async () => null,
		currentVersion: async () => "1.0.0",
	});
}

describe("store phases", () => {
	beforeEach(() => {
		resetUpdateDeps();
		resetState();
	});

	test("second check while checking is no-op", async () => {
		let resolveCheck: (value: null) => void = () => {};
		const pending = new Promise<null>((resolve) => {
			resolveCheck = resolve;
		});
		setUpdateDeps({
			checkUpdater: () => pending,
			fetchGithub: async () => null,
			currentVersion: async () => "1.0.0",
		});
		const first = checkForUpdates();
		await Promise.resolve();
		expect(getState().phase).toBe("checking");
		const second = checkForUpdates();
		await second;
		expect(getState().phase).toBe("checking");
		resolveCheck(null);
		await first;
	});

	test("no newer version ends current", async () => {
		setUpdateDeps({
			checkUpdater: async () => null,
			fetchGithub: async () => null,
			currentVersion: async () => "1.0.0",
		});
		await checkForUpdates();
		expect(getState().phase).toBe("current");
	});

	test("newer version goes to ready after download", async () => {
		serveUpdate(
			updater({
				download: async (onEvent) => {
					onEvent?.({ event: "Started", data: { contentLength: 10 } });
					onEvent?.({ event: "Progress", data: { chunkLength: 10 } });
					onEvent?.({ event: "Finished" });
				},
			}),
		);
		await checkForUpdates();
		expect(getState().phase).toBe("ready");
	});

	test("download failure keeps a retryable offer and closes its handle once", async () => {
		let closes = 0;
		serveUpdate(
			updater({
				download: async () => {
					throw new Error("boom");
				},
				close: async () => {
					closes += 1;
				},
			}),
		);
		await checkForUpdates();
		expect(getState().phase).toBe("failed");
		expect(getState().message).toBe("boom");
		expect(getState().offer?.version).toBe("2.0.0");
		expect(closes).toBe(1);
		// The retry the kept offer promises, and the closed handle is never closed a second time.
		serveUpdate(updater());
		await checkForUpdates();
		expect(getState().phase).toBe("ready");
		expect(closes).toBe(1);
	});

	test("second restart while the install is pending installs and relaunches once", async () => {
		let installs = 0;
		let relaunches = 0;
		let finishInstall: () => void = () => {};
		const pending = new Promise<void>((resolve) => {
			finishInstall = resolve;
		});
		serveUpdate(
			updater({
				install: async () => {
					installs += 1;
					await pending;
				},
			}),
		);
		setUpdateDeps({
			relaunch: async () => {
				relaunches += 1;
			},
		});
		await checkForUpdates();
		expect(getState().phase).toBe("ready");
		const first = restartWithUpdate();
		const second = restartWithUpdate();
		await second;
		expect(installs).toBe(1);
		expect(relaunches).toBe(0);
		finishInstall();
		await first;
		expect(installs).toBe(1);
		expect(relaunches).toBe(1);
	});

	test("a successful install relaunches once", async () => {
		let installs = 0;
		let relaunches = 0;
		serveUpdate(
			updater({
				install: async () => {
					installs += 1;
				},
			}),
		);
		setUpdateDeps({
			relaunch: async () => {
				relaunches += 1;
			},
		});
		await checkForUpdates();
		await restartWithUpdate();
		expect(installs).toBe(1);
		expect(relaunches).toBe(1);
	});
});
