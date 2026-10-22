import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	hoverTooltip,
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
import {
	type Location,
	lspCompletion,
	lspDefinition,
	lspHover,
	lspReferences,
} from "@/project/api";

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
	/** Open project root; null disables all LSP requests. */
	root?: string | null;
	/** Navigate to a definition location. */
	onNavigate?: (path: string, line: number, character: number) => void;
	/** Receive reference locations. */
	onReferences?: (locations: Location[]) => void;
	/** Move the caret to a zero-based position and scroll it into view. */
	reveal?: { line: number; character: number; token: number } | null;
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

function kindToType(kind: number | null): string {
	switch (kind) {
		case 2:
			return "method";
		case 3:
			return "function";
		case 4:
			return "constructor";
		case 5:
			return "field";
		case 6:
			return "variable";
		case 7:
			return "class";
		case 8:
			return "interface";
		case 9:
			return "namespace";
		case 10:
			return "property";
		case 13:
			return "enum";
		case 14:
			return "keyword";
		case 15:
			return "snippet";
		case 20:
			return "enumMember";
		case 21:
			return "constant";
		case 22:
			return "struct";
		case 23:
			return "event";
		case 24:
			return "operator";
		case 25:
			return "type";
		default:
			return "text";
	}
}

function toLspPosition(view: EditorView, pos: number): { line: number; character: number } {
	const lineObj = view.state.doc.lineAt(pos);
	return { line: lineObj.number - 1, character: pos - lineObj.from };
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
	root = null,
	onNavigate,
	onReferences,
	reveal = null,
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
	const rootRef = useRef<string | null>(root);
	rootRef.current = root;
	const navigateRef = useRef<((path: string, line: number, character: number) => void) | null>(
		onNavigate ?? null,
	);
	navigateRef.current = onNavigate ?? null;
	const referencesRef = useRef<((locations: Location[]) => void) | null>(onReferences ?? null);
	referencesRef.current = onReferences ?? null;
	const revealTokenRef = useRef<number | null>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (host === null) return;

		const language = new Compartment();
		languageRef.current = language;

		let completionSeq = 0;
		let hoverSeq = 0;
		let navSeq = 0;

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
					keymap.of([
						...defaultKeymap,
						...historyKeymap,
						{
							key: "F12",
							run: () => {
								const currentView = viewRef.current;
								if (currentView === null) return false;
								const currentRoot = rootRef.current;
								const currentPath = latestRef.current.path;
								if (currentRoot === null || currentPath === null) return false;
								const callback = navigateRef.current;
								if (callback === null) return false;
								const pos = currentView.state.selection.main.head;
								const { line, character } = toLspPosition(currentView, pos);
								const mySeq = ++navSeq;
								void (async () => {
									let locations: Location[] = [];
									try {
										locations = await lspDefinition(
											currentRoot,
											currentPath,
											line,
											character,
										);
									} catch {
										locations = [];
									}
									if (mySeq !== navSeq) return;
									if (locations.length === 0) return;
									const first = locations[0];
									callback(
										first.path,
										first.range.start.line,
										first.range.start.character,
									);
								})();
								return true;
							},
						},
						{
							key: "Shift-F12",
							run: () => {
								const currentView = viewRef.current;
								if (currentView === null) return false;
								const currentRoot = rootRef.current;
								const currentPath = latestRef.current.path;
								if (currentRoot === null || currentPath === null) return false;
								const callback = referencesRef.current;
								if (callback === null) return false;
								const pos = currentView.state.selection.main.head;
								const { line, character } = toLspPosition(currentView, pos);
								const mySeq = ++navSeq;
								void (async () => {
									let locations: Location[] = [];
									try {
										locations = await lspReferences(
											currentRoot,
											currentPath,
											line,
											character,
										);
									} catch {
										locations = [];
									}
									if (mySeq !== navSeq) return;
									callback(locations);
								})();
								return true;
							},
						},
					]),
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
					EditorView.domEventHandlers({
						mousedown: (event, view) => {
							if (!(event.metaKey || event.ctrlKey)) return false;
							const currentRoot = rootRef.current;
							const currentPath = latestRef.current.path;
							const callback = navigateRef.current;
							if (currentRoot === null || currentPath === null || callback === null)
								return false;
							const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
							if (pos === null) return false;
							const { line, character } = toLspPosition(view, pos);
							const mySeq = ++navSeq;
							void (async () => {
								let locations: Location[] = [];
								try {
									locations = await lspDefinition(
										currentRoot,
										currentPath,
										line,
										character,
									);
								} catch {
									locations = [];
								}
								if (mySeq !== navSeq) return;
								if (locations.length === 0) return;
								const first = locations[0];
								callback(
									first.path,
									first.range.start.line,
									first.range.start.character,
								);
							})();
							return false;
						},
					}),
					autocompletion({
						override: [
							async (context) => {
								const currentRoot = rootRef.current;
								const currentPath = latestRef.current.path;
								if (currentRoot === null || currentPath === null) return null;
								const mySeq = ++completionSeq;
								const completionView = context.view;
								if (completionView === undefined) return null;
								const { line, character } = toLspPosition(
									completionView,
									context.pos,
								);
								let result: Awaited<ReturnType<typeof lspCompletion>>;
								try {
									result = await lspCompletion(
										currentRoot,
										currentPath,
										line,
										character,
									);
								} catch {
									return null;
								}
								if (mySeq !== completionSeq) return null;
								if (result === null) return null;
								const word = context.matchBefore(/\w*/);
								const from = word === null ? context.pos : word.from;
								const options = result.items.map((item) => ({
									label: item.label,
									detail: item.detail ?? undefined,
									type: kindToType(item.kind),
									apply: item.insertText ?? item.label,
								}));
								return { from, options };
							},
						],
					}),
					hoverTooltip(async (view, pos) => {
						const currentRoot = rootRef.current;
						const currentPath = latestRef.current.path;
						if (currentRoot === null || currentPath === null) return null;
						const mySeq = ++hoverSeq;
						const { line, character } = toLspPosition(view, pos);
						let info: Awaited<ReturnType<typeof lspHover>>;
						try {
							info = await lspHover(currentRoot, currentPath, line, character);
						} catch {
							return null;
						}
						if (mySeq !== hoverSeq) return null;
						if (info === null) return null;
						let tooltipPos = pos;
						let tooltipEnd: number | undefined;
						if (info.range !== null) {
							const startLine = view.state.doc.line(info.range.start.line + 1);
							const endLine = view.state.doc.line(info.range.end.line + 1);
							tooltipPos = startLine.from + info.range.start.character;
							tooltipEnd = endLine.from + info.range.end.character;
						}
						const text = info.contents;
						return {
							pos: tooltipPos,
							end: tooltipEnd,
							create: () => {
								const dom = document.createElement("div");
								dom.textContent = text;
								dom.style.fontSize = "12px";
								dom.style.fontFamily =
									'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';
								dom.style.whiteSpace = "pre-wrap";
								return { dom };
							},
						};
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

	// Reveal-only transaction: moves the caret, scrolls it into view and focuses. Keyed on the
	// token so a repeated target still re-dispatches, while a same-token value does nothing.
	useEffect(() => {
		const view = viewRef.current;
		if (view === null || reveal === null) return;
		if (revealTokenRef.current === reveal.token) return;
		revealTokenRef.current = reveal.token;
		const doc = view.state.doc;
		const lineCount = doc.lines;
		const requestedLine = Math.trunc(reveal.line);
		const clampedLine = Math.min(Math.max(requestedLine, 0), Math.max(lineCount - 1, 0));
		const lineObj = doc.line(clampedLine + 1);
		const requestedChar = Math.trunc(reveal.character);
		const clampedChar = Math.min(Math.max(requestedChar, 0), lineObj.length);
		const pos = lineObj.from + clampedChar;
		view.dispatch({
			selection: { anchor: pos },
			effects: EditorView.scrollIntoView(pos),
		});
		view.focus();
	}, [reveal]);

	return <div className="editor-host" ref={hostRef} />;
}
