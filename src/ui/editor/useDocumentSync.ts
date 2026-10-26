import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";

export type DocumentSyncArgs = {
	viewRef: { current: EditorView | null };
	value: string;
};

export function useDocumentSync({ viewRef, value }: DocumentSyncArgs): void {
	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const doc = view.state.doc;
		if (doc.length === value.length && doc.toString() === value) return;
		view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
	}, [value, viewRef]);
}
