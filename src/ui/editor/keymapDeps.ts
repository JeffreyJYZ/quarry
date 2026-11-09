import type { ServerKind } from "@/lib/lsp/served";
import type { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { CodeAction, Diagnostic, Location } from "@/lib/project/api";

import type { InlayHint } from "@/lib/project/api";

/** What the surface's key bindings reach: refs for live values, setters for the panels they open. */
export type KeymapDeps = {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	latestRef: {
		current: { path: string | null; value: string; onChange: (value: string) => void };
	};
	runningRef: { current: ReadonlySet<ServerKind> };
	navigateRef: { current: ((path: string, line: number, character: number) => void) | null };
	referencesRef: { current: ((locations: Location[]) => void) | null };
	occurrenceHistoryRef: { current: EditorSelection[] };
	navSeqRef: { current: number };
	occSeqRef: { current: number };
	occTimerRef: { current: number | null };
	hintsVisibleRef: { current: boolean };
	inlayHintsRef: { current: InlayHint[] };
	searchOpenRef: { current: boolean };
	openSearchRef: { current: (replace: boolean) => void };
	closeSearchRef: { current: () => void };
	stepRef: { current: (delta: number) => void };
	/** Toggles a breakpoint on a 1-based line; null until the shell has a file to act on. */
	toggleBreakpointRef: { current: ((line: number) => void) | null };
	/** The open document's findings, which a quick-fix request must carry to get its action. */
	diagnosticsRef: { current: Diagnostic[] };
	applyInlay: (hints: InlayHint[] | null) => void;
	hideSig: () => void;
	runSig: () => Promise<void>;
	clearOccurrences: () => void;
	renameOpen: boolean;
	codeMenuOpen: boolean;
	setRenameValue: (value: string) => void;
	setRenameOpen: (value: boolean) => void;
	setCodeActions: (actions: CodeAction[]) => void;
	setCodeMenuOpen: (value: boolean) => void;
	toggleHints: () => void;
};

/** The editor's state and view types, re-exported so the binding modules need one import. */
export type { EditorSelection, EditorView };
