import "@/test/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { inEditableTarget, inTerminal } from "./focusGuard";

/** The stub lives on the real document, so a later component test still finds one. */
const original = Object.getOwnPropertyDescriptor(document, "activeElement");

function focus(activeElement: unknown) {
	Object.defineProperty(document, "activeElement", {
		configurable: true,
		get: () => activeElement,
	});
}

describe("focusGuard", () => {
	afterEach(() => {
		if (original === undefined) {
			delete (document as { activeElement?: unknown }).activeElement;
		} else {
			Object.defineProperty(document, "activeElement", original);
		}
	});
	test("body focus is not editable or terminal", () => {
		focus({ tagName: "BODY", getAttribute: () => null });
		expect(inEditableTarget()).toBe(false);
		expect(inTerminal()).toBe(false);
	});
	test("input tag is editable", () => {
		focus({ tagName: "INPUT", getAttribute: () => null });
		expect(inEditableTarget()).toBe(true);
	});
	test("terminal closest detection", () => {
		focus({
			tagName: "DIV",
			getAttribute: () => null,
			closest: (s: string) => (s === ".xterm" ? {} : null),
		});
		expect(inTerminal()).toBe(true);
	});
});
