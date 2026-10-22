import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { type JSX, useEffect, useRef } from "react";
import "@/editor/editor.css";
import { languageForPath } from "@/editor/languages";
import { quarryHighlightStyle, quarryTheme } from "@/editor/theme";

export type EditorProps = {
	/** Absolute path of the open file, or null for an empty buffer. */
	path: string | null;
	value: string;
	onChange: (value: string) => void;
};

/**
 * CodeMirror 6 surface. One `EditorView` per mount; `value` stays caller-owned and is pushed into the
 * document only when it actually differs, so local edits keep their selection and scroll position.
 */
export default function Editor({ path, value, onChange }: EditorProps): JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageRef = useRef<Compartment | null>(null);
	const latestRef = useRef({ path, value, onChange });
	latestRef.current = { path, value, onChange };

	useEffect(() => {
		const host = hostRef.current;
		if (host === null) return;

		const language = new Compartment();
		languageRef.current = language;

		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: latestRef.current.value,
				extensions: [
					lineNumbers(),
					highlightActiveLineGutter(),
					highlightActiveLine(),
					drawSelection(),
					history(),
					indentUnit.of("    "),
					EditorState.tabSize.of(4),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					language.of(languageForPath(latestRef.current.path)),
					quarryTheme,
					syntaxHighlighting(quarryHighlightStyle),
					EditorView.contentAttributes.of({
						"aria-label": "Editor",
						spellcheck: "false",
					}),
					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return;
						const next = update.state.doc.toString();
						if (next === latestRef.current.value) return;
						latestRef.current.onChange(next);
					}),
				],
			}),
		});

		viewRef.current = view;

		return () => {
			viewRef.current = null;
			languageRef.current = null;
			view.destroy();
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		const language = languageRef.current;
		if (view === null || language === null) return;
		view.dispatch({ effects: language.reconfigure(languageForPath(path)) });
	}, [path]);

	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const current = view.state.doc.toString();
		if (current === value) return;
		view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
	}, [value]);

	return <div className="editor-host" ref={hostRef} />;
}
