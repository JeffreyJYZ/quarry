import { useCallback, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { toLspPosition } from "@/lib/editor/positions";
import type { SignatureHelp } from "@/lib/project/api";
import { lspSignatureHelp } from "@/lib/project/api";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import type { ServerKind } from "@/lib/lsp/served";

export type SignatureHelpArgs = {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
	runningRef?: { current: ReadonlySet<ServerKind> };
};

export function useSignatureHelp({ viewRef, rootRef, pathRef, runningRef }: SignatureHelpArgs) {
	const running = runningRef ?? { current: new Set<ServerKind>(["rust-analyzer", "clangd"]) };
	const [sigHelp, setSigHelp] = useState<SignatureHelp | null>(null);
	const [sigCoords, setSigCoords] = useState<{
		left: number;
		top: number;
		bottom: number;
	} | null>(null);
	const sigSeqRef = useRef(0);
	const sigTimerRef = useRef<number | null>(null);
	const sigHideTimerRef = useRef<number | null>(null);

	const hideSig = useCallback(() => {
		setSigHelp(null);
		setSigCoords(null);
		if (sigHideTimerRef.current !== null) {
			window.clearTimeout(sigHideTimerRef.current);
			sigHideTimerRef.current = null;
		}
	}, []);

	const runSig = useCallback(async () => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		const kind = servedByRunningServer(currentPath, running.current);
		if (view === null || currentRoot === null || currentPath === null || kind === null) {
			hideSig();
			return;
		}
		const pos = view.state.selection.main.head;
		const { line, character } = toLspPosition(view, pos);
		const mySeq = ++sigSeqRef.current;
		let result: SignatureHelp | null = null;
		try {
			result = await lspSignatureHelp(
				sessionId(kind, currentRoot),
				currentPath,
				line,
				character,
			);
		} catch {
			result = null;
		}
		if (mySeq !== sigSeqRef.current) return;
		if (result === null || result.signatures.length === 0) {
			hideSig();
			return;
		}
		setSigHelp(result);
		// Viewport coordinates: the popup is fixed-positioned, so it can flip near a screen edge.
		const coords = view.coordsAtPos(pos);
		if (coords !== null) {
			setSigCoords({ left: coords.left, top: coords.top, bottom: coords.bottom });
		}
		if (sigHideTimerRef.current !== null) window.clearTimeout(sigHideTimerRef.current);
		sigHideTimerRef.current = window.setTimeout(() => {
			setSigHelp(null);
			setSigCoords(null);
		}, 10000);
	}, [viewRef, rootRef, pathRef, hideSig, running.current]);

	const scheduleSig = useCallback(() => {
		if (sigTimerRef.current !== null) window.clearTimeout(sigTimerRef.current);
		sigTimerRef.current = window.setTimeout(() => {
			sigTimerRef.current = null;
			void runSig();
		}, 150);
	}, [runSig]);

	return { sigHelp, sigCoords, hideSig, runSig, scheduleSig, sigTimerRef, sigHideTimerRef };
}
