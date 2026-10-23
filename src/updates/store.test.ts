import { beforeEach, describe, expect, test } from "bun:test";
import { checkForUpdates, getState, installNow, resetUpdateDeps, setUpdateDeps } from "./store";

describe("store no-op rules", () => {
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
		// allow microtask to set checking
		await Promise.resolve();
		expect(getState().phase).toBe("checking");
		const second = checkForUpdates();
		await second;
		expect(getState().phase).toBe("checking");
		resolveCheck(null);
		await first;
	});

	test("install refused unless updater offer available", async () => {
		setUpdateDeps({
			checkUpdater: async () => null,
			fetchGithub: async () => ({ version: "2.0.0" }),
			currentVersion: async () => "1.0.0",
		});
		await checkForUpdates();
		expect(getState().phase).toBe("available");
		expect(getState().offer?.kind).toBe("github");
		await installNow();
		expect(getState().phase).toBe("available");
	});
});
