import { useImperativeHandle } from "react";
import type { EditorView } from "@codemirror/view";
import type { Ref } from "react";
import { applyFormatted } from "@/ui/editor/useFormatDocument";
import type { EditorHandle } from "@/ui/editor/editorTypes";

/**
 * The handle a parent reaches the editor through.
 *
 * `format` formats, applies the text and restores the caret to the same line and column; `formatText`
 * only returns the text, for a save that wants to write the formatted source itself.
 *
 * The applied action is also returned, so the surface wires its context menu's Format row to this
 * same function instead of running the formatter again and dropping what it answers.
 */
export function useEditorHandle(options: {
	ref: Ref<EditorHandle>;
	viewRef: { current: EditorView | null };
	latestRef: { current: { onChange: (value: string) => void } };
	runFormatText: () => Promise<string | null>;
	onNoticeRef?: { current: ((message: string | null) => void) | null };
}): () => Promise<void> {
	const { ref, viewRef, latestRef, runFormatText, onNoticeRef } = options;
	const format = (): Promise<void> =>
		applyFormatted({ viewRef, latestRef, formatText: runFormatText, onNotice: onNoticeRef });
	useImperativeHandle(ref, () => ({ formatText: runFormatText, format }));
	return format;
}
