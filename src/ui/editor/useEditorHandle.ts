import { useImperativeHandle } from "react";
import type { EditorView } from "@codemirror/view";
import type { Ref } from "react";
import type { EditorHandle } from "@/ui/editor/editorTypes";

/**
 * The handle a parent reaches the editor through.
 *
 * `format` formats, applies the text and restores the caret to the same line and column; `formatText`
 * only returns the text, for a save that wants to write the formatted source itself.
 */
export function useEditorHandle(options: {
	ref: Ref<EditorHandle>;
	viewRef: { current: EditorView | null };
	latestRef: { current: { onChange: (value: string) => void } };
	runFormatText: () => Promise<string | null>;
}): void {
	const { ref, viewRef, latestRef, runFormatText } = options;
	useImperativeHandle(ref, () => ({
		formatText: runFormatText,
		format: async () => {
			const view = viewRef.current;
			if (view === null) return;
			const head = view.state.selection.main.head;
			const lineObj = view.state.doc.lineAt(head);
			const originalLine = lineObj.number;
			const originalCol = head - lineObj.from;
			const formatted = await runFormatText();
			if (formatted === null) return;
			latestRef.current.onChange(formatted);
			window.setTimeout(() => {
				const live = viewRef.current;
				if (live === null) return;
				const doc = live.state.doc;
				const targetLine = Math.min(originalLine, doc.lines);
				const newLine = doc.line(targetLine);
				const col = Math.min(originalCol, newLine.length);
				live.dispatch({ selection: { anchor: newLine.from + col } });
			}, 0);
		},
	}));
}
