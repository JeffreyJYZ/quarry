import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
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
import { breakpointGutter, normalizeLines, setBreakpoints } from "@/editor/breakpoints";
import { lintSignature, toLintDiagnostics } from "@/editor/diagnostics";
import { languageForPath } from "@/editor/languages";
import { quarryHighlightStyle, quarryTheme } from "@/editor/theme";
import type { Diagnostic } from "@/project/api";

export type EditorProps = {
	/** Absolute path of the open file, or null for an empty buffer. */
	path: string | null;
	value: string;
	onChange: (value: string) => void;
	/** Diagnostics for this document only. The editor renders them; it never fetches them. */
	diagnostics?: Diagnostic[];
	/** 1-based lines carrying a breakpoint. Rendered as a filled dot in the breakpoint gutter. */
	breakpointLines?: number[];
	/** Subset of `breakpointLines` the adapter has not confirmed. Rendered hollow and dimmed. */
	unverifiedLines?: number[];
	/** Clicking the breakpoint gutter reports a 1-based line; the caller owns the set. */
	onToggleBreakpoint?: (line: number) => void;
};

const NO_LINES: number[] = [];

function sameLines(left: readonly number[], right: readonly number[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

function sameSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
	if (left.size !== right.size) return false;
	for (const value of left) {
		if (!right.has(value)) return false;
	}
	return true;
}

/**
 * CodeMirror 6 surface. One `EditorView` per mount; `value` stays caller-owned and is pushed into the
 * document only when it actually differs, so local edits keep their selection and scroll position.
 * Breakpoints arrive as props and reach the gutter through a state field, never a rebuilt view.
 */
export default function Editor({
	path,
	value,
	onChange,
	diagnostics,
	breakpointLines = NO_LINES,
	unverifiedLines = NO_LINES,
	onToggleBreakpoint,
}: EditorProps): JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageRef = useRef<Compartment | null>(null);
	const publishedRef = useRef<{ view: EditorView | null; signature: string }>({
		view: null,
		signature: "",
	});
	const markersRef = useRef<{
		view: EditorView | null;
		lines: number[];
		unverified: Set<number>;
	}>({ view: null, lines: [], unverified: new Set() });
	const latestRef = useRef({ path, value, onChange });
	latestRef.current = { path, value, onChange };
	const toggleRef = useRef<((line: number) => void) | null>(onToggleBreakpoint ?? null);
	toggleRef.current = onToggleBreakpoint ?? null;

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
					breakpointGutter,
					lineNumbers(),
					lintGutter(),
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
			markersRef.current = { view: null, lines: [], unverified: new Set() };
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

	// Markers-only transaction: an effect and no document change, so the update listener stays quiet.
	// The trampoline reads the live callback, so a new handler identity never forces a dispatch.
	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const lines = normalizeLines(breakpointLines);
		const unverified = new Set(normalizeLines(unverifiedLines));
		const published = markersRef.current;
		if (
			published.view === view &&
			sameLines(published.lines, lines) &&
			sameSet(published.unverified, unverified)
		) {
			return;
		}
		markersRef.current = { view, lines, unverified };
		view.dispatch({
			effects: setBreakpoints.of({
				lines,
				unverified,
				toggle: (line) => {
					toggleRef.current?.(line);
				},
			}),
		});
	}, [breakpointLines, unverifiedLines]);

	// Diagnostics-only transaction: it carries an effect and no document change, so the update
	// listener above stays quiet and an edit never enters here. The guard is keyed to the view so a
	// re-created view (StrictMode remount) still publishes.
	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const mapped = toLintDiagnostics(view.state, diagnostics);
		const signature = lintSignature(mapped);
		const published = publishedRef.current;
		if (published.view === view && published.signature === signature) return;
		publishedRef.current = { view, signature };
		view.dispatch(setDiagnostics(view.state, mapped));
	}, [diagnostics]);

	return <div className="editor-host" ref={hostRef} />;
}
