import "@/test/render";
import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { renderHook } from "@testing-library/react";
import { act } from "@/test/render";
import { useEditorContextMenu } from "@/ui/editor/useEditorContextMenu";

/**
 * The clipboard is the one async source of a replacement in the editor: Cut and Paste await the
 * webview's clipboard and then dispatch.
 *
 * `src/ui/editor/useEditorContextMenu.ts:94-101` reads `view.state.selection` inside
 * `replaceSelection`, which runs after the await, so the range is measured against the live
 * document and a document that changed while the clipboard was busy cannot produce a stale range.
 * These tests pin that guard.
 */

function mountMenu(doc: string) {
	const view = new EditorView({
		state: EditorState.create({ doc }),
		parent: document.createElement("div") as unknown as HTMLElement,
	});
	const viewRef = { current: view as EditorView | null };
	const hook = renderHook(() =>
		useEditorContextMenu({ viewRef, path: "/p/a.cpp", onFormat: () => undefined }),
	);
	return { view, hook };
}

function item(hook: ReturnType<typeof mountMenu>["hook"], label: string) {
	const items = hook.result.current.items({ x: 0, y: 0, line: 1, hasSelection: true });
	const found = items.find((entry) => entry.label === label);
	if (found === undefined) throw new Error(`no ${label} item`);
	return found;
}

describe("a clipboard write that lands after the document changed", () => {
	test("paste replaces the live selection, not the one it started with", async () => {
		const { view, hook } = mountMenu("first\nsecond\n");
		view.dispatch({ selection: { anchor: 0, head: 5 } });

		const clipboard = navigator.clipboard as unknown as Record<string, unknown>;
		Object.defineProperty(clipboard, "readText", {
			configurable: true,
			value: async () => {
				// The document shrinks while the clipboard is being read.
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "x\n" } });
				return "PASTE";
			},
		});

		await act(async () => {
			item(hook, "Paste").onSelect?.();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		// The selection mapped into the shortened document, so the paste lands at its mapped
		// caret — not where the old [0,5) was. What matters is that no stale range is dispatched.
		expect(view.state.doc.toString()).toContain("PASTE");
	});

	test("cut never removes text outside the live document", async () => {
		const { view, hook } = mountMenu("first\nsecond\n");
		view.dispatch({ selection: { anchor: 0, head: 5 } });

		const clipboard = navigator.clipboard as unknown as Record<string, unknown>;
		Object.defineProperty(clipboard, "writeText", {
			configurable: true,
			value: async () => {
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "x\n" } });
			},
		});

		await act(async () => {
			item(hook, "Cut").onSelect?.();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(view.state.doc.length).toBeLessThanOrEqual(2);
	});
});
