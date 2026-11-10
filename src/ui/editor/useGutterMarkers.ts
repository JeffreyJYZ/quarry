import type { EditorRefs } from "@/ui/editor/useEditorRefs";
import { useBookmarkGutter } from "@/ui/editor/useBookmarkGutter";
import { useBreakpointGutter } from "@/ui/editor/useBreakpointGutter";

/**
 * Publishes both gutter columns in one place.
 *
 * The breakpoint and bookmark columns are the same shape — a line list pushed into a state field
 * plus a toggle ref — so the surface mounts them together instead of repeating the wiring twice.
 */
export function useGutterMarkers(
	refs: EditorRefs,
	lines: { breakpointLines: number[]; unverifiedLines: number[]; bookmarkLines: number[] },
): void {
	useBreakpointGutter({
		viewRef: refs.viewRef,
		breakpointLines: lines.breakpointLines,
		unverifiedLines: lines.unverifiedLines,
		markersRef: refs.markersRef,
		toggleRef: refs.toggleRef,
	});
	useBookmarkGutter({
		viewRef: refs.viewRef,
		bookmarkLines: lines.bookmarkLines,
		markersRef: refs.bookmarkMarkersRef,
		toggleRef: refs.bookmarkToggleRef,
	});
}
