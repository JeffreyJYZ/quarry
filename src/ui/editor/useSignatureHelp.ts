import { useCallback, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { toLspPosition } from "@/lib/editor/positions";
import type { SignatureHelp } from "@/lib/project/api";
import { lspSignatureHelp } from "@/lib/project/api";

export type SignatureHelpArgs = {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
};

export function useSignatureHelp({ viewRef, rootRef, pathRef }: SignatureHelpArgs) {
	const [sigHelp, setSigHelp] = useState<SignatureHelp | null>(null);
	const [sigCoords, setSigCoords] = useState<{ top: number; left: number } | null>(null);
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
		if (view === null || currentRoot === null || currentPath === null) {
			hideSig();
			return;
		}
		const pos = view.state.selection.main.head;
		const { line, character } = toLspPosition(view, pos);
		const mySeq = ++sigSeqRef.current;
		let result: SignatureHelp | null = null;
		try {
			result = await lspSignatureHelp(currentRoot, currentPath, line, character);
		} catch {
			result = null;
		}
		if (mySeq !== sigSeqRef.current) return;
		if (result === null || result.signatures.length === 0) {
			hideSig();
			return;
		}
		setSigHelp(result);
		const host = view.dom.parentElement;
		const coords = view.coordsAtPos(pos);
		if (coords !== null && host !== null) {
			const rect = host.getBoundingClientRect();
			setSigCoords({ top: coords.bottom - rect.top, left: coords.left - rect.left });
		}
		if (sigHideTimerRef.current !== null) window.clearTimeout(sigHideTimerRef.current);
		sigHideTimerRef.current = window.setTimeout(() => {
			setSigHelp(null);
			setSigCoords(null);
		}, 10000);
	}, [viewRef, rootRef, pathRef, hideSig]);

	const scheduleSig = useCallback(() => {
		if (sigTimerRef.current !== null) window.clearTimeout(sigTimerRef.current);
		sigTimerRef.current = window.setTimeout(() => {
			sigTimerRef.current = null;
			void runSig();
		}, 150);
	}, [runSig]);

	return { sigHelp, sigCoords, hideSig, runSig, scheduleSig, sigTimerRef, sigHideTimerRef };
}
