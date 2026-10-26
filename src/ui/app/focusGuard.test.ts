import { afterEach, describe, expect, test } from "bun:test";
import { inEditableTarget, inTerminal } from "./focusGuard";

describe("focusGuard", () => {
	afterEach(() => {
		delete (globalThis as { document?: unknown }).document;
	});
	test("body focus is not editable or terminal", () => {
		(globalThis as { document?: unknown }).document = {
			activeElement: { tagName: "BODY", getAttribute: () => null },
		};
		expect(inEditableTarget()).toBe(false);
		expect(inTerminal()).toBe(false);
	});
	test("input tag is editable", () => {
		(globalThis as { document?: unknown }).document = {
			activeElement: { tagName: "INPUT", getAttribute: () => null },
		};
		expect(inEditableTarget()).toBe(true);
	});
	test("terminal closest detection", () => {
		(globalThis as { document?: unknown }).document = {
			activeElement: {
				tagName: "DIV",
				getAttribute: () => null,
				closest: (s: string) => (s === ".xterm" ? {} : null),
			},
		};
		expect(inTerminal()).toBe(true);
	});
});
