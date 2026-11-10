import { useEffect } from "react";
import { normalizeLines } from "@/lib/editor/breakpoints";
import { setBookmarks } from "@/lib/bookmarks/gutter";
import { sameLines } from "@/lib/editor/compare";
import type { EditorView } from "@codemirror/view";

export type BookmarkGutterArgs = {
	viewRef: { current: EditorView | null };
	bookmarkLines: number[];
	/** The last set published to this view, so a same-line render does not dispatch again. */
	markersRef: { current: { view: EditorView | null; lines: number[] } };
	toggleRef: { current: ((line: number) => void) | null };
};

/** Pushes the bookmarked lines into the view; the field owns the markers from then on. */
export function useBookmarkGutter({
	viewRef,
	bookmarkLines,
	markersRef,
	toggleRef,
}: BookmarkGutterArgs): void {
	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const lines = normalizeLines(bookmarkLines);
		const published = markersRef.current;
		if (published.view === view && sameLines(published.lines, lines)) return;
		markersRef.current = { view, lines };
		view.dispatch({
			effects: setBookmarks.of({
				lines,
				toggle: (line: number) => {
					toggleRef.current?.(line);
				},
			}),
		});
	}, [bookmarkLines, viewRef, markersRef, toggleRef]);
}
