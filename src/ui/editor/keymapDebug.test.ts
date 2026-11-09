import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { debugBindings, resolveDebugKey } from "@/ui/editor/keymapDebug";

/** A view-shaped stub: the binding only reads the document and the caret. */
function stubView(doc: string, caret: number) {
	const state = EditorState.create({ doc, selection: { anchor: caret } });
	return { view: { state } as never };
}

function press(
	key: string,
	modifiers: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">> = {},
) {
	return { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers };
}

const binding = (toggle: ((line: number) => void) | null) =>
	debugBindings({ toggleBreakpointRef: { current: toggle } }).find(
		(entry) => entry.key === "Mod-F8",
	);

describe("Mod-F8 in the editor", () => {
	test("is bound, because the shell's keymap ignores keys while editing", () => {
		expect(binding(() => {})).toBeDefined();
	});

	test("toggles the line the caret is on, 1-based", () => {
		const seen: number[] = [];
		const run = binding((line) => seen.push(line))?.run;
		const { view } = stubView("int a;\nint b;\nint c;\n", 9);
		expect(run?.(view)).toBe(true);
		expect(seen).toEqual([2]);
	});

	test("stays out of the way when there is no file to act on", () => {
		const run = binding(null)?.run;
		const { view } = stubView("int a;\n", 0);
		expect(run?.(view)).toBe(false);
	});
});

describe("resolveDebugKey", () => {
	test("resolves Mod-F8 to the breakpoint toggle, never a step, with a live session", () => {
		expect(resolveDebugKey(press("F8", { metaKey: true }), true)).toBe("toggleBreakpoint");
		expect(resolveDebugKey(press("f8", { ctrlKey: true }), true)).toBe("toggleBreakpoint");
	});

	test("resolves Mod-F8 to the toggle with no live session", () => {
		expect(resolveDebugKey(press("F8", { metaKey: true }), false)).toBe("toggleBreakpoint");
	});

	test("keeps the unmodified step keys", () => {
		expect(resolveDebugKey(press("F7"), true)).toBe("stepIn");
		expect(resolveDebugKey(press("F8"), true)).toBe("next");
		expect(resolveDebugKey(press("F8", { shiftKey: true }), true)).toBe("stepOut");
		expect(resolveDebugKey(press("F9"), true)).toBe("continue");
	});

	test("does not answer a step key without a live session", () => {
		expect(resolveDebugKey(press("F7"), false)).toBeNull();
		expect(resolveDebugKey(press("F8"), false)).toBeNull();
		expect(resolveDebugKey(press("F9"), false)).toBeNull();
	});

	test("leaves every other modified chord alone", () => {
		expect(resolveDebugKey(press("F7", { metaKey: true }), true)).toBeNull();
		expect(resolveDebugKey(press("F9", { altKey: true }), true)).toBeNull();
		expect(resolveDebugKey(press("F8", { altKey: true }), true)).toBeNull();
	});
});
