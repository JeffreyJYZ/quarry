import { useEffect } from "react";
import { setBreakpoints, normalizeLines } from "@/lib/editor/breakpoints";
import { sameLines, sameSet } from "@/lib/editor/compare";
import type { EditorView } from "@codemirror/view";

export type BreakpointGutterArgs = {
	viewRef: { current: EditorView | null };
	breakpointLines: number[];
	unverifiedLines: number[];
	markersRef: { current: { view: EditorView | null; lines: number[]; unverified: Set<number> } };
	toggleRef: { current: ((line: number) => void) | null };
};

export function useBreakpointGutter({
	viewRef,
	breakpointLines,
	unverifiedLines,
	markersRef,
	toggleRef,
}: BreakpointGutterArgs): void {
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
				toggle: (line: number) => {
					toggleRef.current?.(line);
				},
			}),
		});
	}, [breakpointLines, unverifiedLines, viewRef, markersRef, toggleRef]);
}
