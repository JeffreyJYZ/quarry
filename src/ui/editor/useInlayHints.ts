import { useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { type InlayHint, lspInlayHints } from "@/lib/project/api";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import type { ServerKind } from "@/lib/lsp/served";
import { setInlayHints } from "@/lib/editor/inlayHints";

/** Inlay hints: fetched after a short pause and discarded if the document moved on. */
export function useInlayHints(options: {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
	runningRef?: { current: ReadonlySet<ServerKind> };
}) {
	const { viewRef, rootRef, pathRef } = options;
	const runningRef = options.runningRef ?? {
		current: new Set<ServerKind>(["rust-analyzer", "clangd"]),
	};
	const [hintsVisible, setHintsVisible] = useState(true);
	const hintsVisibleRef = useRef(hintsVisible);
	hintsVisibleRef.current = hintsVisible;
	const inlaySeqRef = useRef(0);
	const inlayTimerRef = useRef<number | null>(null);
	const inlayHintsRef = useRef<InlayHint[]>([]);

	const applyInlay = (hints: InlayHint[] | null) => {
		const view = viewRef.current;
		if (view === null) return;
		view.dispatch({ effects: setInlayHints.of(hintsVisibleRef.current ? hints : []) });
	};

	const runInlay = async () => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		const kind = servedByRunningServer(currentPath, runningRef.current);
		if (view === null || currentRoot === null || currentPath === null || kind === null) {
			applyInlay(null);
			return;
		}
		const mySeq = ++inlaySeqRef.current;
		let result: InlayHint[] = [];
		try {
			result = await lspInlayHints(sessionId(kind, currentRoot), currentPath);
		} catch {
			if (mySeq !== inlaySeqRef.current) return;
			applyInlay(null);
			return;
		}
		if (mySeq !== inlaySeqRef.current) return;
		inlayHintsRef.current = result;
		applyInlay(result);
	};

	const toggle = () => {
		setHintsVisible((current) => {
			const next = !current;
			hintsVisibleRef.current = next;
			applyInlay(next ? inlayHintsRef.current : []);
			return next;
		});
	};

	return {
		hintsVisible,
		hintsVisibleRef,
		inlaySeqRef,
		inlayTimerRef,
		inlayHintsRef,
		applyInlay,
		runInlay,
		toggle,
	};
}
