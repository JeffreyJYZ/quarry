import { useEffect } from "react";
import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setBlame } from "@/lib/editor/blame";
import { languageForPath } from "@/lib/editor/languages";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";

/**
 * The effects that push a prop change into the live view.
 *
 * Each one is keyed by exactly the value it applies, so a keystroke never re-runs them.
 */
export function useEditorEffects(options: {
	refs: EditorRefs;
	path: string | null;
	tabSize: number;
	fontSize: number;
	fontFamily: string;
	blame: { line: number; label: string }[] | null;
	reveal: { line: number; character: number; token: number } | null;
	applyInlay: (hints: null) => void;
	runInlay: () => Promise<void>;
	inlayTimerRef: { current: number | null };
	inlaySeqRef: { current: number };
	inlayHintsRef: { current: unknown[] };
}): void {
	const { refs } = options;

	useEffect(() => {
		const view = refs.viewRef.current;
		const language = refs.languageRef.current;
		if (view === null || language === null) return;
		view.dispatch({ effects: language.reconfigure(languageForPath(options.path)) });
	}, [refs, options.path]);

	useEffect(() => {
		const view = refs.viewRef.current;
		const indentation = refs.indentRef.current;
		if (view === null || indentation === null) return;
		view.dispatch({
			effects: indentation.reconfigure([
				indentUnit.of(" ".repeat(options.tabSize)),
				EditorState.tabSize.of(options.tabSize),
			]),
		});
	}, [refs, options.tabSize]);

	useEffect(() => {
		const host = refs.hostRef.current;
		if (host === null) return;
		host.style.setProperty("--editor-font-size", `${options.fontSize}px`);
		if (options.fontFamily === "") host.style.removeProperty("--editor-font-family");
		else host.style.setProperty("--editor-font-family", options.fontFamily);
	}, [refs, options.fontFamily, options.fontSize]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
	useEffect(() => {
		options.inlayHintsRef.current = [];
		if (options.inlayTimerRef.current !== null) {
			window.clearTimeout(options.inlayTimerRef.current);
			options.inlayTimerRef.current = null;
		}
		options.inlaySeqRef.current += 1;
		if (options.path === null) {
			options.applyInlay(null);
			return;
		}
		void options.runInlay();
	}, [options.path]);

	useEffect(() => {
		const view = refs.viewRef.current;
		if (view === null) return;
		view.dispatch({ effects: setBlame.of(options.blame ?? null) });
	}, [refs, options.blame]);

	// Reveal-only transaction: moves the caret, scrolls it into view and focuses. Keyed by a token
	// so a repeated target still re-dispatches, while a same-token value does not.
	useEffect(() => {
		const view = refs.viewRef.current;
		const reveal = options.reveal;
		if (view === null || reveal === null) return;
		if (refs.revealTokenRef.current === reveal.token) return;
		refs.revealTokenRef.current = reveal.token;
		const doc = view.state.doc;
		const requestedLine = Math.trunc(reveal.line);
		const clampedLine = Math.min(Math.max(requestedLine, 0), Math.max(doc.lines - 1, 0));
		const lineObj = doc.line(clampedLine + 1);
		const requestedChar = Math.trunc(reveal.character);
		const clampedChar = Math.min(Math.max(requestedChar, 0), lineObj.length);
		const pos = lineObj.from + clampedChar;
		view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos) });
		view.focus();
	}, [refs, options.reveal]);
}
