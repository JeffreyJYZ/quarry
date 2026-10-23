import { useEffect } from "react";
import { setDiagnostics } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { toLintDiagnostics, lintSignature } from "@/lib/editor/diagnostics";

export type DiagnosticsPublishArgs = {
	viewRef: { current: EditorView | null };
	diagnostics: any;
	publishedRef: { current: { view: EditorView | null; signature: string } };
};

export function useDiagnosticsPublish({
	viewRef,
	diagnostics,
	publishedRef,
}: DiagnosticsPublishArgs): void {
	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const mapped = toLintDiagnostics(view.state, diagnostics);
		const signature = lintSignature(mapped);
		const published = publishedRef.current;
		if (published.view === view && published.signature === signature) return;
		publishedRef.current = { view, signature };
		view.dispatch(setDiagnostics(view.state, mapped));
	}, [diagnostics, viewRef, publishedRef]);
}
