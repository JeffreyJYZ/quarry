import { describe, expect, test } from "bun:test";
import { shouldFocusTerminal } from "./focusTarget";

/** A fake event target: `closest` is the only member the helper looks at. */
function target(hit: unknown): EventTarget {
	return { closest: () => hit } as unknown as EventTarget;
}

describe("shouldFocusTerminal", () => {
	test("no target", () => {
		expect(shouldFocusTerminal(null)).toBe(false);
	});
	test("scrollback or chrome background", () => {
		expect(shouldFocusTerminal(target(null))).toBe(true);
	});
	test("inside an icon button", () => {
		expect(shouldFocusTerminal(target({ tagName: "BUTTON" }))).toBe(false);
	});
	test("inside a link", () => {
		expect(shouldFocusTerminal(target({ tagName: "A" }))).toBe(false);
	});
	test("plain node target without closest", () => {
		expect(shouldFocusTerminal({} as EventTarget)).toBe(true);
	});
});
