import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { bookmarkBindings } from "@/ui/editor/keymapBookmarks";

/** A view-shaped stub: the binding only reads the document and the caret. */
function stubView(doc: string, caret: number) {
	const state = EditorState.create({ doc, selection: { anchor: caret } });
	return { view: { state } as never };
}

const binding = (toggle: ((line: number) => void) | null) =>
	bookmarkBindings({ toggleBookmarkRef: { current: toggle } }).find(
		(entry) => entry.key === "Mod-Alt-k",
	);

describe("the bookmark chord in the editor", () => {
	test("is Mod-Alt-K, a chord no native menu item owns", () => {
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
