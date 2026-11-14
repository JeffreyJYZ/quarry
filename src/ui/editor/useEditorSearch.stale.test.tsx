import "@/test/render";
import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { renderHook } from "@testing-library/react";
import { act } from "@/test/render";
import { useEditorSearch } from "@/ui/editor/useEditorSearch";

/**
 * In-file replace-one and step through the matches held in `matchesRef`, which used to be the list
 * measured when the search last ran.
 *
 * The document can still be edited while the panel is open — clicking into the editor and typing
 * does it — and dispatching those offsets then carries a range past the live document: the
 * reported `Invalid change range 6 to 10 (in doc of length 2)` from `replaceOne`, and
 * `Selection points outside of document` from `step`. Both recompute against the live text now.
 */

function mountSearch(doc: string) {
	const view = new EditorView({
		state: EditorState.create({ doc }),
		parent: document.createElement("div") as unknown as HTMLElement,
	});
	const viewRef = { current: view as EditorView | null };
	const hook = renderHook(() => useEditorSearch(viewRef));
	return { view, hook };
}

/** Open the panel on `query`, the way the search bar does before it shows a list. */
function search(hook: ReturnType<typeof mountSearch>["hook"], query: string, replacement = "") {
	act(() => {
		hook.result.current.open(true);
		hook.result.current.changeQuery(query);
		hook.result.current.changeReplacement(replacement);
	});
	act(() => {
		hook.result.current.recompute();
	});
}

describe("replace-one after the document shrank", () => {
	test("a stale match does not build a range past the live document", () => {
		const doc = "first line\nsecond line\nthird line\n";
		const { view, hook } = mountSearch(doc);
		search(hook, "line");
		expect(hook.result.current.matches.length).toBe(3);

		// The user empties most of the file while the panel is open.
		act(() => {
			view.dispatch({ changes: { from: 0, to: doc.length, insert: "x\n" } });
		});

		// This used to dispatch a range past the end of the document and throw.
		act(() => {
			hook.result.current.replaceOne();
		});
		expect(hook.result.current.matches).toEqual([]);
	});

	test("a match that still exists is replaced where it now is", () => {
		const { view, hook } = mountSearch("one line\ntwo line\nthree line\n");
		search(hook, "line", "paint");

		// A line typed above every match moves all of them five characters down.
		act(() => {
			view.dispatch({ changes: { from: 0, insert: "zero\n" } });
		});
		act(() => {
			hook.result.current.replaceOne();
		});

		expect(view.state.doc.toString()).toBe("zero\none paint\ntwo line\nthree line\n");
	});
});

describe("step after the document shrank", () => {
	test("a stale selection is recomputed instead of dispatched", () => {
		const doc = "first line\nsecond line\nthird line\n";
		const { view, hook } = mountSearch(doc);
		search(hook, "line");
		expect(hook.result.current.matches.length).toBe(3);

		act(() => {
			view.dispatch({ changes: { from: 0, to: doc.length, insert: "x\n" } });
		});

		// This used to publish the old ranges and select them, which threw
		// `Selection points outside of document`.
		act(() => {
			hook.result.current.step(1);
		});
		expect(hook.result.current.matches).toEqual([]);
		expect(view.state.selection.main.to).toBeLessThanOrEqual(view.state.doc.length);
	});
});
