import { beforeEach, describe, expect, mock, test } from "bun:test";

/** Every `invoke` the wrapper made, so the command name can be asserted rather than assumed. */
const calls: string[] = [];

// Spread the real module: the api index also pulls in modules that reach `event`, which imports
// helpers from `core` at load time, so a stub holding only `invoke` fails the import graph.
const actual = await import("@tauri-apps/api/core");
mock.module("@tauri-apps/api/core", () => ({
	...actual,
	invoke: (command: string) => {
		calls.push(command);
		return Promise.resolve("main-2");
	},
}));

describe("new window wrapper", () => {
	beforeEach(() => {
		calls.length = 0;
	});

	test("invokes the new_window command", async () => {
		const { newWindow } = await import("@/lib/project/api/windows");
		const label = await newWindow();
		expect(calls).toEqual(["new_window"]);
		expect(label).toBe("main-2");
	});

	test("is exported from the api index the shell imports", async () => {
		const api = await import("@/lib/project/api");
		expect(typeof api.newWindow).toBe("function");
	});
});
