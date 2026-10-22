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
import { forwardRef, type JSX, useEffect, useImperativeHandle, useRef, useState } from "react";
import "@/editor/editor.css";
import { breakpointGutter, normalizeLines, setBreakpoints } from "@/editor/breakpoints";
import { lintSignature, toLintDiagnostics } from "@/editor/diagnostics";
import { languageForPath } from "@/editor/languages";
import {
	emptySearchState,
	type SearchMatch,
	searchDecorations,
	searchField,
	setSearchMatches,
} from "@/editor/search";
import { quarryHighlightStyle, quarryTheme } from "@/editor/theme";
import type { CodeAction, Diagnostic, FileEdit } from "@/project/api";
import {
	formatDocument,
	formatterFor,
	type Location,
	lspCodeActions,
	lspCompletion,
	lspDefinition,
	lspHover,
	lspReferences,
	lspRename,
} from "@/project/api";
import { describeError } from "@/project/errors";

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
	/** Report a one-line status to the host (no formatter / formatter failure). */
	onNotice?: (message: string | null) => void;
	/** Report caret position changes. */
	onCursor?: (position: { line: number; character: number }) => void;
	/** Apply a batch of file edits produced by rename or code actions. */
	onApplyEdits?: (edits: FileEdit[]) => void;
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
export type EditorHandle = { format: () => Promise<void> };

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
	{
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
		onNotice,
		onCursor,
		onApplyEdits,
	}: EditorProps,
	ref,
): JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [replaceMode, setReplaceMode] = useState(false);
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [useRegex, setUseRegex] = useState(false);
	const [matches, setMatches] = useState<SearchMatch[]>([]);
	const [active, setActive] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const [codeActions, setCodeActions] = useState<CodeAction[]>([]);
	const [codeMenuOpen, setCodeMenuOpen] = useState(false);
	const searchOpenRef = useRef(searchOpen);
	searchOpenRef.current = searchOpen;
	const queryRef = useRef(query);
	queryRef.current = query;
	const caseRef = useRef(caseSensitive);
	caseRef.current = caseSensitive;
	const regexRef = useRef(useRegex);
	regexRef.current = useRegex;
	const replacementRef = useRef(replacement);
	replacementRef.current = replacement;
	const matchesRef = useRef(matches);
	matchesRef.current = matches;
	const activeRef = useRef(active);
	activeRef.current = active;
	const openSearchRef = useRef<(replace: boolean) => void>(() => undefined);
	const closeSearchRef = useRef<() => void>(() => undefined);
	const stepRef = useRef<(delta: number) => void>(() => undefined);
	const recomputeRef = useRef<() => void>(() => undefined);
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
	const onNoticeRef = useRef<((message: string | null) => void) | null>(onNotice ?? null);
	onNoticeRef.current = onNotice ?? null;
	const onCursorRef = useRef<((position: { line: number; character: number }) => void) | null>(
		onCursor ?? null,
	);
	onCursorRef.current = onCursor ?? null;
	const onApplyEditsRef = useRef<((edits: FileEdit[]) => void) | null>(onApplyEdits ?? null);
	onApplyEditsRef.current = onApplyEdits ?? null;
	const lastCursorRef = useRef<{ line: number; character: number } | null>(null);
	const revealTokenRef = useRef<number | null>(null);

	const recompute = () => {
		const view = viewRef.current;
		if (view === null) return;
		const q = queryRef.current;
		if (!searchOpenRef.current || q === "") {
			setMatches([]);
			setActive(0);
			setError(null);
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		let source = q;
		if (!regexRef.current) {
			source = q.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
		}
		let re: RegExp;
		try {
			const flags = caseRef.current ? "g" : "gi";
			re = new RegExp(source, flags);
		} catch {
			setMatches([]);
			setActive(0);
			setError("invalid regex");
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		setError(null);
		const text = view.state.doc.toString();
		const found: SearchMatch[] = [];
		re.lastIndex = 0;
		let match: RegExpExecArray | null = re.exec(text);
		while (match !== null) {
			if (match[0].length === 0) {
				re.lastIndex += 1;
				match = re.exec(text);
				continue;
			}
			found.push({ from: match.index, to: match.index + match[0].length });
			if (found.length > 10000) break;
			match = re.exec(text);
		}
		setMatches(found);
		const nextActive = found.length > 0 ? 0 : -1;
		setActive(Math.max(nextActive, 0));
		view.dispatch({
			effects: setSearchMatches.of({
				matches: found,
				active: nextActive >= 0 ? nextActive : -1,
			}),
		});
		if (found.length > 0) {
			const first = found[0];
			view.dispatch({ selection: { anchor: first.from, head: first.to } });
		}
	};

	const openSearch = (replace: boolean) => {
		setReplaceMode(replace);
		setSearchOpen(true);
		searchOpenRef.current = true;
	};

	const closeSearch = () => {
		setSearchOpen(false);
		searchOpenRef.current = false;
		setMatches([]);
		setActive(0);
		setError(null);
		const view = viewRef.current;
		if (view !== null) {
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			view.focus();
		}
	};

	const stepMatch = (delta: number) => {
		const current = matchesRef.current;
		if (current.length === 0) return;
		const next = (activeRef.current + delta + current.length) % current.length;
		setActive(next);
		activeRef.current = next;
		const view = viewRef.current;
		if (view !== null) {
			view.dispatch({
				effects: setSearchMatches.of({ matches: current, active: next }),
			});
			const m = current[next];
			view.dispatch({ selection: { anchor: m.from, head: m.to } });
		}
	};

	const replaceOne = () => {
		const view = viewRef.current;
		const current = matchesRef.current;
		if (view === null || current.length === 0) return;
		const m = current[activeRef.current];
		view.dispatch({
			changes: { from: m.from, to: m.to, insert: replacementRef.current },
		});
	};

	const replaceAll = () => {
		const view = viewRef.current;
		const current = matchesRef.current;
		if (view === null || current.length === 0) return;
		const changes = [...current].reverse().map((m) => ({
			from: m.from,
			to: m.to,
			insert: replacementRef.current,
		}));
		view.dispatch({ changes });
	};
	const submitRename = () => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = latestRef.current.path;
		if (view === null || currentRoot === null || currentPath === null) {
			setRenameOpen(false);
			return;
		}
		const name = renameValue.trim();
		setRenameOpen(false);
		if (name === "") return;
		const { line, character } = toLspPosition(view, view.state.selection.main.head);
		void (async () => {
			let result: FileEdit[] = [];
			try {
				result = await lspRename(currentRoot, currentPath, line, character, name);
			} catch {
				result = [];
			}
			if (result.length === 0) {
				onNoticeRef.current?.("Rename unavailable here");
				return;
			}
			onApplyEditsRef.current?.(result);
		})();
	};

	const applyCodeAction = (action: CodeAction) => {
		setCodeMenuOpen(false);
		if (action.edits.length > 0) {
			onApplyEditsRef.current?.(action.edits);
		}
	};

	openSearchRef.current = openSearch;
	closeSearchRef.current = closeSearch;
	stepRef.current = stepMatch;
	recomputeRef.current = recompute;

	useImperativeHandle(ref, () => ({
		format: async () => {
			const view = viewRef.current;
			const currentRoot = rootRef.current;
			const currentPath = latestRef.current.path;
			if (view === null || currentRoot === null || currentPath === null) return;
			const notify = onNoticeRef.current;
			let formatter = "";
			try {
				formatter = await formatterFor(currentPath);
			} catch (error) {
				notify?.(describeError(error));
				return;
			}
			if (formatter === "") {
				const ext = currentPath.includes(".")
					? currentPath.slice(currentPath.lastIndexOf(".") + 1)
					: "";
				notify?.(`No formatter for ${ext}`);
				return;
			}
			const text = view.state.doc.toString();
			const head = view.state.selection.main.head;
			const lineObj = view.state.doc.lineAt(head);
			const originalLine = lineObj.number;
			const originalCol = head - lineObj.from;
			try {
				const formatted = await formatDocument(currentRoot, currentPath, text);
				latestRef.current.onChange(formatted);
				window.setTimeout(() => {
					const v = viewRef.current;
					if (v === null) return;
					const doc = v.state.doc;
					const targetLine = Math.min(originalLine, doc.lines);
					const newLine = doc.line(targetLine);
					const col = Math.min(originalCol, newLine.length);
					const pos = newLine.from + col;
					v.dispatch({ selection: { anchor: pos } });
				}, 0);
			} catch (error) {
				notify?.(describeError(error));
			}
		},
	}));

	// biome-ignore lint/correctness/useExhaustiveDependencies: keymap reads state via closure
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
					searchField,
					searchDecorations,
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
						{
							key: "Mod-f",
							run: () => {
								openSearchRef.current(false);
								return true;
							},
						},
						{
							key: "Mod-Alt-f",
							run: () => {
								openSearchRef.current(true);
								return true;
							},
						},
						{
							key: "Mod-g",
							run: () => {
								if (!searchOpenRef.current) return false;
								stepRef.current(1);
								return true;
							},
						},
						{
							key: "F2",
							run: () => {
								const view = viewRef.current;
								if (view === null) return false;
								const pos = view.state.selection.main.head;
								let ident = "";
								// find identifier containing pos
								const line = view.state.doc.lineAt(pos);
								const rel = pos - line.from;
								const before =
									line.text.slice(0, rel).match(/[A-Za-z0-9_]*$/)?.[0] ?? "";
								const after =
									line.text.slice(rel).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";
								ident = before + after;
								setRenameValue(ident);
								setRenameOpen(true);
								return true;
							},
						},
						{
							key: "Alt-Enter",
							run: () => {
								const view = viewRef.current;
								if (view === null) return false;
								const currentRoot = rootRef.current;
								const currentPath = latestRef.current.path;
								if (currentRoot === null || currentPath === null) return false;
								const { line, character } = toLspPosition(
									view,
									view.state.selection.main.head,
								);
								void (async () => {
									let actions: CodeAction[] = [];
									try {
										actions = await lspCodeActions(
											currentRoot,
											currentPath,
											line,
											character,
										);
									} catch {
										actions = [];
									}
									if (actions.length === 0) {
										setCodeMenuOpen(false);
										setCodeActions([]);
										return;
									}
									setCodeActions(actions);
									setCodeMenuOpen(true);
								})();
								return true;
							},
						},
						{
							key: "Escape",
							run: () => {
								if (renameOpen) {
									setRenameOpen(false);
									return true;
								}
								if (codeMenuOpen) {
									setCodeMenuOpen(false);
									return true;
								}
								if (!searchOpenRef.current) return false;
								closeSearchRef.current();
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
						if (update.docChanged) {
							const next = update.state.doc.toString();
							if (next !== latestRef.current.value) {
								latestRef.current.onChange(next);
								if (searchOpenRef.current) {
									window.setTimeout(() => recomputeRef.current(), 0);
								}
							}
						}
						if (update.selectionSet) {
							const pos = update.state.selection.main.head;
							const { line, character } = toLspPosition(update.view, pos);
							const last = lastCursorRef.current;
							if (
								last === null ||
								last.line !== line ||
								last.character !== character
							) {
								lastCursorRef.current = { line, character };
								onCursorRef.current?.({ line, character });
							}
						}
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: recompute reads refs
	useEffect(() => {
		if (!searchOpen) return;
		recompute();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchOpen, query, caseSensitive, useRegex]);

	return (
		<div className="editor-host" ref={hostRef} style={{ position: "relative" }}>
			{searchOpen ? (
				<div className="cm-search-bar">
					<input
						className="search-input"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							queryRef.current = e.target.value;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								if (e.shiftKey) stepRef.current(-1);
								else stepRef.current(1);
							}
							if (e.key === "Escape") {
								e.preventDefault();
								closeSearchRef.current();
							}
						}}
					/>
					<span className="search-count">
						{matches.length === 0
							? error !== null
								? ""
								: "0 of 0"
							: `${active + 1} of ${matches.length}`}
					</span>
					{error !== null ? <span className="search-error">{error}</span> : null}
					<button type="button" onClick={() => stepRef.current(-1)} aria-label="previous">
						Prev
					</button>
					<button type="button" onClick={() => stepRef.current(1)} aria-label="next">
						Next
					</button>
					<button
						type="button"
						className={caseSensitive ? "active" : ""}
						onClick={() => {
							setCaseSensitive((v) => !v);
							caseRef.current = !caseSensitive;
						}}
						aria-label="case sensitive"
					>
						Aa
					</button>
					<button
						type="button"
						className={useRegex ? "active" : ""}
						onClick={() => {
							setUseRegex((v) => !v);
							regexRef.current = !useRegex;
						}}
						aria-label="regex"
					>
						.*
					</button>
					{replaceMode ? (
						<>
							<input
								className="replace-input"
								value={replacement}
								onChange={(e) => {
									setReplacement(e.target.value);
									replacementRef.current = e.target.value;
								}}
							/>
							<button type="button" onClick={replaceOne}>
								Replace
							</button>
							<button type="button" onClick={replaceAll}>
								Replace all
							</button>
						</>
					) : null}
					<button type="button" onClick={closeSearchRef.current} aria-label="close">
						Close
					</button>
				</div>
			) : null}
			{renameOpen ? (
				<div className="cm-rename-bar">
					<input
						className="rename-input"
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								submitRename();
							}
							if (e.key === "Escape") {
								e.preventDefault();
								setRenameOpen(false);
							}
						}}
					/>
				</div>
			) : null}
			{codeMenuOpen && codeActions.length > 0 ? (
				<ul className="cm-codeactions">
					{codeActions.map((action) => (
						<li key={action.title}>
							<button type="button" onClick={() => applyCodeAction(action)}>
								{action.title}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
});

export default Editor;
