import type { EditorView } from "@codemirror/view";
import { extensionOf } from "@/lib/consts/extensions";
import { formatDocument, formatterFor } from "@/lib/project/api";
import { formatJsonText } from "@/lib/project/save";
import { describeError } from "@/lib/project/errors";
import { fileName } from "@/lib/project/paths";

/** How a format result is rejected when the document it described is no longer the live one. */
export const DISCARDED_FORMAT_NOTICE =
	"Format result discarded: the document changed while it was being formatted.";

/**
 * Await a format result, then apply it through the document-identity guard.
 *
 * The answer describes the document at request time. Anything typed while the formatter runs makes
 * the live document a different one, so its text is not a replacement for what is there: the
 * result is discarded with a notice rather than replacing the user's typing. The caret is restored
 * to the same line and column once the new text has been pushed in.
 *
 * Both entry points — the keyboard action behind `EditorHandle.format` and the context menu's
 * Format row — go through this one function, so a missing, failed or stale result reaches the same
 * notice channel from either.
 */
export async function applyFormatted(options: {
	viewRef: { current: EditorView | null };
	latestRef: { current: { onChange: (value: string) => void } };
	formatText: () => Promise<string | null>;
	onNotice?: { current: ((message: string | null) => void) | null };
}): Promise<void> {
	const { viewRef, latestRef, formatText, onNotice } = options;
	const view = viewRef.current;
	if (view === null) return;
	const requested = view.state.doc;
	const head = view.state.selection.main.head;
	const lineObj = view.state.doc.lineAt(head);
	const originalLine = lineObj.number;
	const originalCol = head - lineObj.from;
	const formatted = await formatText();
	if (formatted === null) return;
	const live = viewRef.current;
	if (live === null || live.state.doc !== requested) {
		onNotice?.current?.(DISCARDED_FORMAT_NOTICE);
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
}

/** The format action: ask which formatter this file has, then run it over the whole document. */
export function useFormatDocument(options: {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
	onNotice: { current: ((message: string | null) => void) | null };
}) {
	const { viewRef, rootRef, pathRef, onNotice } = options;

	return async (): Promise<string | null> => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		if (view === null || currentRoot === null || currentPath === null) return null;
		const notify = onNotice.current;
		const ext = extensionOf(currentPath);

		if (ext === "json" || ext === "jsonc") {
			try {
				return formatJsonText(view.state.doc.toString(), fileName(currentPath));
			} catch (error) {
				notify?.(describeError(error));
				return null;
			}
		}

		let formatter = "";
		try {
			formatter = await formatterFor(currentPath);
		} catch (error) {
			notify?.(describeError(error));
			return null;
		}
		if (formatter === "") {
			notify?.(
				`No formatter for .${ext}: install taplo-cli (TOML) or configure one in Settings.`,
			);
			return null;
		}
		try {
			return await formatDocument(currentRoot, currentPath, view.state.doc.toString());
		} catch (error) {
			notify?.(describeError(error));
			return null;
		}
	};
}
