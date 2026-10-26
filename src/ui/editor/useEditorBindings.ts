import type { CodeAction } from "@/lib/project/api";
import type { BehaviourDeps } from "@/ui/editor/extensionsBehaviour";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";

type Refs = {
	searchOpenRef: { current: boolean };
	openSearchRef: { current: (replace: boolean) => void };
	closeSearchRef: { current: () => void };
	stepRef: { current: (delta: number) => void };
	recomputeRef: { current: () => void };
	occurrenceHistoryRef: { current: import("@codemirror/state").EditorSelection[] };
	hintsVisibleRef: { current: boolean };
	inlayHintsRef: { current: import("@/lib/project/api").InlayHint[] };
	occSeqRef: { current: number };
	occTimerRef: { current: number | null };
	onCursorRef: { current: ((position: { line: number; character: number }) => void) | null };
	lastCursorRef: { current: { line: number; character: number } | null };
};

type Actions = {
	applyInlay: (hints: import("@/lib/project/api").InlayHint[] | null) => void;
	hideSig: () => void;
	runSig: () => Promise<void>;
	clearOccurrences: () => void;
	scheduleSig: () => void;
	scheduleOccurrences: () => void;
	runInlay: () => Promise<void>;
	toggleHints: () => void;
	renameOpen: boolean;
	codeMenuOpen: boolean;
	setRenameValue: (value: string) => void;
	setRenameOpen: (value: boolean) => void;
	setCodeActions: (actions: CodeAction[]) => void;
	setCodeMenuOpen: (value: boolean) => void;
	inlayTimerRef: { current: number | null };
};

/**
 * The objects the editor's bindings close over.
 *
 * They are built once with the view, so every value they need arrives as a ref; the two completion
 * counters live in a box so a binding can bump them without rebuilding the keymap.
 */
export function useEditorBindings(options: {
	refs: EditorRefs;
	search: Refs;
	actions: Actions;
	runningRef?: { current: ReadonlySet<import("@/lib/lsp/served").ServerKind> };
}): {
	deps: KeymapDeps;
	behaviour: BehaviourDeps;
} {
	const { refs, search, actions } = options;
	const runningRef = options.runningRef ?? {
		current: new Set<import("@/lib/lsp/served").ServerKind>(["rust-analyzer", "clangd"]),
	};
	const counters = { completionSeq: 0, hoverSeq: 0 };

	const deps: KeymapDeps = {
		viewRef: refs.viewRef,
		rootRef: refs.rootRef,
		latestRef: refs.latestRef,
		runningRef,
		navigateRef: refs.navigateRef,
		referencesRef: refs.referencesRef,
		occurrenceHistoryRef: search.occurrenceHistoryRef,
		navSeqRef: { current: 0 },
		occSeqRef: search.occSeqRef,
		occTimerRef: search.occTimerRef,
		hintsVisibleRef: search.hintsVisibleRef,
		inlayHintsRef: search.inlayHintsRef,
		searchOpenRef: search.searchOpenRef,
		openSearchRef: search.openSearchRef,
		closeSearchRef: search.closeSearchRef,
		stepRef: search.stepRef,
		applyInlay: actions.applyInlay,
		hideSig: actions.hideSig,
		runSig: actions.runSig,
		clearOccurrences: actions.clearOccurrences,
		renameOpen: actions.renameOpen,
		codeMenuOpen: actions.codeMenuOpen,
		setRenameValue: actions.setRenameValue,
		setRenameOpen: actions.setRenameOpen,
		setCodeActions: actions.setCodeActions,
		setCodeMenuOpen: actions.setCodeMenuOpen,
		toggleHints: actions.toggleHints,
	};

	const behaviour: BehaviourDeps = {
		...deps,
		get completionSeq() {
			return counters.completionSeq;
		},
		set completionSeq(value: number) {
			counters.completionSeq = value;
		},
		get hoverSeq() {
			return counters.hoverSeq;
		},
		set hoverSeq(value: number) {
			counters.hoverSeq = value;
		},
		recomputeRef: search.recomputeRef,
		scheduleSig: actions.scheduleSig,
		scheduleOccurrences: actions.scheduleOccurrences,
		inlayTimerRef: actions.inlayTimerRef,
		runInlay: actions.runInlay,
		onCursorRef: search.onCursorRef,
		lastCursorRef: search.lastCursorRef,
	};

	return { deps, behaviour };
}
