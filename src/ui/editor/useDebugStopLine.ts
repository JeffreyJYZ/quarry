import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { setStopLine, stopLineOf } from "@/lib/editor/stopLine";
import type { EditorDebug } from "@/ui/editor/editorTypes";

export type DebugStopArgs = {
	viewRef: { current: EditorView | null };
	path: string | null;
	debug?: EditorDebug;
};

/**
 * Paints the stopped line and scrolls it into view when the stop lands.
 *
 * The published line is remembered per view so an ordinary render does not dispatch again, and a
 * line the document no longer has paints nothing instead of being clamped onto a neighbour.
 */
export function useDebugStopLine({ viewRef, path, debug }: DebugStopArgs): void {
	const publishedRef = useRef<{ view: EditorView | null; line: number }>({ view: null, line: 0 });
	const stopped = debug?.stopped === true;
	const line = debug?.line ?? 0;
	const stopPath = debug?.path ?? null;

	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const wanted = stopLineOf({ stopped, path: stopPath, line }, path);
		const next = wanted >= 1 && wanted <= view.state.doc.lines ? wanted : 0;
		const published = publishedRef.current;
		if (published.view === view && published.line === next) return;
		publishedRef.current = { view, line: next };
		view.dispatch({
			effects:
				next === 0
					? setStopLine.of(null)
					: [
							setStopLine.of(next),
							EditorView.scrollIntoView(view.state.doc.line(next).from, {
								y: "center",
							}),
						],
		});
	}, [path, stopPath, line, stopped, viewRef]);
}
