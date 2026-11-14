import "@/test/render";
import { history, undo } from "@codemirror/commands";
import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { useDocumentSync } from "@/ui/editor/useDocumentSync";
import { cleanup, render } from "@/test/render";

/**
 * `useDocumentSync` is the one writer that replaces the whole document from outside the view.
 *
 * Its range is `{from: 0, to: view.state.doc.length}` read at dispatch time
 * (`src/ui/editor/useDocumentSync.ts:24-29`), so a document that shrank between the buffer update
 * and the effect cannot produce a range past the end. These tests pin that, and record what the
 * replacement does to undo history and to the selection.
 */

type HarnessProps = { value: string; onView: (view: EditorView) => void };

function Harness({ value, onView }: HarnessProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const emittedRef = useRef<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: one view per mount, as in the surface
	useEffect(() => {
		const host = hostRef.current;
		if (host === null) return;
		const view = new EditorView({
			parent: host,
			state: EditorState.create({ doc: value, extensions: [history()] }),
		});
		viewRef.current = view;
		onView(view);
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	useDocumentSync({ viewRef, value, emittedRef });
	return <div ref={hostRef} />;
}

/** Mount once, then push a new external value the way a buffer reload does. */
function mountSync(initial: string) {
	let view: EditorView | null = null;
	const take = (next: string) => ({
		next,
		value: next,
		onView: (created: EditorView) => {
			view = created;
		},
	});
	const taken = take(initial);
	const mounted = render(<Harness value={taken.value} onView={taken.onView} />);
	return {
		view: () => view as EditorView | null,
		push: (value: string) =>
			mounted.rerender(<Harness value={value} onView={() => undefined} />),
	};
}

describe("an external replacement over a shorter document", () => {
	test("lands the new text and never throws", () => {
		const sync = mountSync("one\ntwo\nthree\nfour\n");
		const view = sync.view();
		expect(view).not.toBeNull();

		expect(() => sync.push("x\n")).not.toThrow();
		expect(view?.state.doc.toString()).toBe("x\n");
		cleanup();
	});

	test("keeps the selection inside the new document", () => {
		const sync = mountSync("one\ntwo\nthree\n");
		const view = sync.view() as EditorView;
		view.dispatch({ selection: { anchor: view.state.doc.length } });

		sync.push("x");
		const head = view.state.selection.main.head;
		expect(head).toBeLessThanOrEqual(view.state.doc.length);
		expect(head).toBeGreaterThanOrEqual(0);
		cleanup();
	});

	test("undo walks back to the text before the replacement", () => {
		const sync = mountSync("before\n");
		const view = sync.view() as EditorView;

		sync.push("after\n");
		expect(view.state.doc.toString()).toBe("after\n");
		undo(view);
		expect(view.state.doc.toString()).toBe("before\n");
		cleanup();
	});
});
