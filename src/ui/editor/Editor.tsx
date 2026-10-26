import type { EditorSelection } from "@codemirror/state";
import { forwardRef, type JSX, useRef } from "react";
import "@/ui/editor/editor.css";
import { useBreakpointGutter } from "@/ui/editor/useBreakpointGutter";
import { useCodeActionMenu } from "@/ui/editor/useCodeActionMenu";
import { useDiagnosticsPublish } from "@/ui/editor/useDiagnosticsPublish";
import { useDocumentSync } from "@/ui/editor/useDocumentSync";
import { useEditorSearch } from "@/ui/editor/useEditorSearch";
import { useEditorRefs } from "@/ui/editor/useEditorRefs";
import { useEditorMount } from "@/ui/editor/useEditorMount";
import { useEditorBindings } from "@/ui/editor/useEditorBindings";
import { useEditorEffects } from "@/ui/editor/useEditorEffects";
import { useEditorHandle } from "@/ui/editor/useEditorHandle";
import { useFormatDocument } from "@/ui/editor/useFormatDocument";
import { useInlayHints } from "@/ui/editor/useInlayHints";
import { useOccurrenceHighlights } from "@/ui/editor/useOccurrenceHighlights";
import { useRenamePanel } from "@/ui/editor/useRenamePanel";
import { useSignatureHelp } from "@/ui/editor/useSignatureHelp";
import CodeActionMenu from "@/ui/editor/surface/CodeActionMenu";
import RenameBar from "@/ui/editor/surface/RenameBar";
import SearchBar from "@/ui/editor/surface/SearchBar";
import SignatureHelpView from "@/ui/editor/surface/SignatureHelp";

import type { EditorHandle, EditorProps } from "@/ui/editor/editorTypes";
export type { EditorHandle, EditorProps } from "@/ui/editor/editorTypes";
const NO_LINES: number[] = [];

/** CodeMirror 6 surface: one view per mount, with `value` pushed in only when it really differs. */
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
		blame = null,
		tabSize = 4,
		fontSize = 13,
		fontFamily = "",
	}: EditorProps,
	ref,
): JSX.Element {
	const refs = useEditorRefs({
		path,
		value,
		onChange,
		onToggleBreakpoint,
		root,
		onNavigate,
		onReferences,
		onNotice,
		onCursor,
		onApplyEdits,
		tabSize,
	});
	const {
		hostRef,
		viewRef,
		publishedRef,
		markersRef,
		pathRef,
		latestRef,
		rootRef,
		onNoticeRef,
		onCursorRef,
		onApplyEditsRef,
		lastCursorRef,
	} = refs;
	const search = useEditorSearch(viewRef);
	const { searchOpen, open: openSearch, close: closeSearch, step: stepMatch } = search;
	const searchOpenRef = search.searchOpenRef;
	const recompute = search.recompute;
	const openSearchRef = useRef<(replace: boolean) => void>(() => undefined);
	const closeSearchRef = useRef<() => void>(() => undefined);
	const stepRef = useRef<(delta: number) => void>(() => undefined);
	const recomputeRef = useRef<() => void>(() => undefined);
	openSearchRef.current = openSearch;
	closeSearchRef.current = closeSearch;
	stepRef.current = stepMatch;
	recomputeRef.current = recompute;
	const rename = useRenamePanel({
		viewRef,
		rootRef,
		pathRef,
		onNotice: onNoticeRef,
		onApplyEdits: onApplyEditsRef,
	});
	const { renameOpen, setRenameOpen, renameValue, setRenameValue, submit: submitRename } = rename;
	const {
		codeActions,
		setCodeActions,
		codeMenuOpen,
		setCodeMenuOpen,
		apply: applyCodeAction,
	} = useCodeActionMenu({ onApplyEdits: onApplyEditsRef });
	const sig = useSignatureHelp({ viewRef, rootRef, pathRef });
	const { sigHelp, sigCoords, hideSig, runSig, scheduleSig } = sig;
	const inlay = useInlayHints({ viewRef, rootRef, pathRef });
	const { hintsVisibleRef, inlayHintsRef, inlayTimerRef, inlaySeqRef, applyInlay, runInlay } =
		inlay;
	const occ = useOccurrenceHighlights({ viewRef, rootRef, pathRef });
	const { occSeqRef, occTimerRef, clearOccurrences, scheduleOccurrences } = occ;
	const occurrenceHistoryRef = useRef<EditorSelection[]>([]);

	const runFormatText = useFormatDocument({ viewRef, rootRef, pathRef, onNotice: onNoticeRef });
	useEditorHandle({ ref, viewRef, latestRef, runFormatText });

	const { deps, behaviour } = useEditorBindings({
		refs,
		search: {
			searchOpenRef,
			openSearchRef,
			closeSearchRef,
			stepRef,
			recomputeRef,
			occurrenceHistoryRef,
			hintsVisibleRef,
			inlayHintsRef,
			occSeqRef,
			occTimerRef,
			onCursorRef,
			lastCursorRef,
		},
		actions: {
			applyInlay,
			hideSig,
			runSig,
			clearOccurrences,
			scheduleSig,
			scheduleOccurrences,
			runInlay,
			toggleHints: inlay.toggle,
			renameOpen,
			codeMenuOpen,
			setRenameValue,
			setRenameOpen,
			setCodeActions,
			setCodeMenuOpen,
			inlayTimerRef,
		},
	});
	useEditorMount({ refs, deps, behaviour });

	useDocumentSync({ viewRef, value });
	useBreakpointGutter({
		viewRef,
		breakpointLines,
		unverifiedLines,
		markersRef,
		toggleRef: refs.toggleRef,
	});
	useDiagnosticsPublish({ viewRef, diagnostics, publishedRef });

	useEditorEffects({
		refs,
		path,
		tabSize,
		fontSize,
		fontFamily,
		blame,
		reveal,
		applyInlay,
		runInlay,
		inlayTimerRef,
		inlaySeqRef,
		inlayHintsRef,
	});

	return (
		<div className="editor-host" ref={hostRef} style={{ position: "relative" }}>
			{searchOpen ? <SearchBar search={search} /> : null}
			{renameOpen ? (
				<RenameBar
					value={renameValue}
					onChange={setRenameValue}
					onSubmit={submitRename}
					onCancel={() => setRenameOpen(false)}
				/>
			) : null}
			{codeMenuOpen && codeActions.length > 0 ? (
				<CodeActionMenu actions={codeActions} onPick={applyCodeAction} />
			) : null}
			{sigHelp !== null && sigCoords !== null ? (
				<SignatureHelpView help={sigHelp} anchor={sigCoords} />
			) : null}
		</div>
	);
});

export default Editor;
