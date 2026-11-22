import { beforeEach, describe, expect, mock, test } from "bun:test";

/** Every invoke the wrapper made, so the command name and payload are asserted, not assumed. */
const calls: { command: string; args: Record<string, unknown> }[] = [];

const actual = await import("@tauri-apps/api/core");
mock.module("@tauri-apps/api/core", () => ({
	...actual,
	invoke: (command: string, args?: Record<string, unknown>) => {
		calls.push({ command, args: args ?? {} });
		return Promise.resolve({
			root: "/p",
			openedRoot: "/p",
			name: "p",
			kind: "cargo",
			buildRoot: "/p",
			launchConfig: null,
		});
	},
}));

describe("init project wrapper", () => {
	beforeEach(() => {
		calls.length = 0;
	});

	test("invokes init_project with the root, kind and standard", async () => {
		const { initProject } = await import("@/lib/project/api/init");
		const info = await initProject("/p", "rust-lib", "2021");
		expect(calls).toEqual([
			{
				command: "init_project",
				args: { root: "/p", kind: "rust-lib", standard: "2021" },
			},
		]);
		expect(info.kind).toBe("cargo");
	});

	test("is exported from the api index the shell imports", async () => {
		const api = await import("@/lib/project/api");
		expect(typeof api.initProject).toBe("function");
	});
});
