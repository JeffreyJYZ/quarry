import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";

export type DocumentSyncArgs = {
	viewRef: { current: EditorView | null };
	value: string;
	/** The text the view itself last emitted, so a keystroke can be skipped unexamined. */
	emittedRef: { current: string | null };
};

/**
 * Push a `value` that came from outside the editor into the live view.
 *
 * A keystroke reaches this effect too — the buffer it updates is the editor's own text — so the text
 * the view just emitted is remembered and the comparison is skipped for it. Comparing the document
 * instead cost a full `doc.toString()` on every keystroke, which is the one allocation a fast typist
 * feels on a long file.
 */
export function useDocumentSync({ viewRef, value, emittedRef }: DocumentSyncArgs): void {
	useEffect(() => {
		if (emittedRef.current === value) return;
		const view = viewRef.current;
		if (view === null) return;
		const doc = view.state.doc;
		if (doc.length === value.length && doc.toString() === value) {
			emittedRef.current = value;
			return;
		}
		view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
		emittedRef.current = value;
	}, [value, viewRef, emittedRef]);
}
