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
	onNotice?: { current: ((message: string | null) => void) | null };
}): void {
	const { ref, viewRef, latestRef, runFormatText, onNotice } = options;
	useImperativeHandle(ref, () => ({
		formatText: runFormatText,
		format: async () => {
			const view = viewRef.current;
			if (view === null) return;
			// The answer describes this document. Anything typed while the formatter runs makes the
			// live document a different one, and its text is not a replacement for what is there.
			const requested = view.state.doc;
			const head = view.state.selection.main.head;
			const lineObj = view.state.doc.lineAt(head);
			const originalLine = lineObj.number;
			const originalCol = head - lineObj.from;
			const formatted = await runFormatText();
			if (formatted === null) return;
			const live = viewRef.current;
			if (live === null || live.state.doc !== requested) {
				onNotice?.current?.(
					"Format result discarded: the document changed while it was being formatted.",
				);
				return;
			}
			latestRef.current.onChange(formatted);
			window.setTimeout(() => {
				const current = viewRef.current;
				if (current === null) return;
				const doc = current.state.doc;
				const targetLine = Math.min(originalLine, doc.lines);
				const newLine = doc.line(targetLine);
				const col = Math.min(originalCol, newLine.length);
				current.dispatch({ selection: { anchor: newLine.from + col } });
			}, 0);
		},
	}));
}
