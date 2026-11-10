import type { TodoGutterProps } from "@/ui/editor/editorTypes";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";
import type { EditorDebug } from "@/ui/editor/editorTypes";
import { useBookmarkGutter } from "@/ui/editor/useBookmarkGutter";
import { useBreakpointGutter } from "@/ui/editor/useBreakpointGutter";
import { useDebugStopLine } from "@/ui/editor/useDebugStopLine";
import { useTodoGutter } from "@/ui/editor/useTodoGutter";

/** No markers, and a shape the hook can read without asking again whether the prop is there. */
const NO_TODO: TodoGutterProps = { markers: [], onOpen: () => undefined };

/**
 * Publishes every gutter column in one place, plus the stopped line.
 *
 * The columns are the same shape — data pushed into a state field, plus the click channel back to
 * the caller — so the surface mounts them together instead of repeating the wiring per column.
 * The stop is a single line and its own column, but it arrives the same way.
 */
export function useGutterMarkers(
	refs: EditorRefs,
	lines: {
		path: string | null;
		breakpointLines: number[];
		unverifiedLines: number[];
		bookmarkLines: number[];
		debug?: EditorDebug;
	},
	todo: TodoGutterProps | undefined,
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
	const column = todo ?? NO_TODO;
	useTodoGutter(
		{
			viewRef: refs.viewRef,
			gutterRef: refs.todoGutterRef,
			markersRef: refs.todoMarkersRef,
		},
		column.markers,
		column.onOpen,
	);
	useDebugStopLine({ viewRef: refs.viewRef, path: lines.path, debug: lines.debug });
}
