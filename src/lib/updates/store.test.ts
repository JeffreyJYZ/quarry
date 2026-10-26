import { beforeEach, describe, expect, test } from "bun:test";
import {
	checkForUpdates,
	getState,
	restartWithUpdate,
	resetUpdateDeps,
	setUpdateDeps,
} from "@/lib/updates/store";

describe("store phases", () => {
	beforeEach(() => {
		resetUpdateDeps();
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
		const update = {
			version: "2.0.0",
			download: async (onEvent?: (e: unknown) => void) => {
				onEvent?.({ event: "Started", data: { contentLength: 10 } });
				onEvent?.({ event: "Progress", data: { chunkLength: 10 } });
				onEvent?.({ event: "Finished" });
			},
			install: async () => {},
			close: async () => {},
		};
		setUpdateDeps({
			checkUpdater: async () => update as never,
			fetchGithub: async () => null,
			currentVersion: async () => "1.0.0",
			relaunch: async () => {},
		});
		await checkForUpdates();
		expect(getState().phase).toBe("ready");
	});

	test("download failure ends failed without throwing", async () => {
		const update = {
			version: "2.0.0",
			download: async () => {
				throw new Error("boom");
			},
			install: async () => {},
			close: async () => {},
		};
		setUpdateDeps({
			checkUpdater: async () => update as never,
			fetchGithub: async () => null,
			currentVersion: async () => "1.0.0",
			relaunch: async () => {},
		});
		await checkForUpdates();
		expect(getState().phase).toBe("failed");
		expect(getState().message).toBe("boom");
	});

	test("restartWithUpdate calls injected relaunch once", async () => {
		let calls = 0;
		setUpdateDeps({
			checkUpdater: async () => null,
			fetchGithub: async () => null,
			currentVersion: async () => "1.0.0",
			relaunch: async () => {
				calls += 1;
			},
		});
		await restartWithUpdate();
		expect(calls).toBe(1);
	});
});
