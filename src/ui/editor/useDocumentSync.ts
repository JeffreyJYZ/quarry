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
		const current = view.state.doc.toString();
		if (current === value) return;
		view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
	}, [value, viewRef]);
}
