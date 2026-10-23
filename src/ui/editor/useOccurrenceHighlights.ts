import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { lspDocumentHighlights } from "@/lib/project/api";
import { toLspPosition } from "@/lib/editor/positions";
import { setOccurrences } from "@/lib/editor/occurrences";

/** The document highlights under the caret: cleared while typing, refetched once the caret rests. */
export function useOccurrenceHighlights(options: {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
}) {
	const { viewRef, rootRef, pathRef } = options;
	const occSeqRef = useRef(0);
	const occTimerRef = useRef<number | null>(null);
	const occPosRef = useRef<number | null>(null);

	const clearOccurrences = () => {
		const view = viewRef.current;
		if (view !== null) view.dispatch({ effects: setOccurrences.of(null) });
	};

	const runOccurrences = async () => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		if (view === null || currentRoot === null || currentPath === null) {
			clearOccurrences();
			return;
		}
		if (!view.hasFocus) {
			clearOccurrences();
			return;
		}
		const pos = view.state.selection.main.head;
		occPosRef.current = pos;
		const mySeq = occSeqRef.current;
		const { line, character } = toLspPosition(view, pos);
		let ranges: Awaited<ReturnType<typeof lspDocumentHighlights>> = [];
		try {
			ranges = await lspDocumentHighlights(currentRoot, currentPath, line, character);
		} catch {
			ranges = [];
		}
		if (mySeq !== occSeqRef.current) return;
		const liveView = viewRef.current;
		if (liveView === null || liveView.state.selection.main.head !== pos) {
			clearOccurrences();
			return;
		}
		const items = ranges
			.map((range) => {
				const startLine = liveView.state.doc.line(
					Math.min(Math.max(range.start.line + 1, 1), liveView.state.doc.lines),
				);
				const endLine = liveView.state.doc.line(
					Math.min(Math.max(range.end.line + 1, 1), liveView.state.doc.lines),
				);
				const from = startLine.from + range.start.character;
				const to = endLine.from + range.end.character;
				const strong = from <= pos && pos <= to;
				return { from, to, strong };
			})
			.filter((item) => item.to > item.from);
		liveView.dispatch({ effects: setOccurrences.of(items) });
	};

	const scheduleOccurrences = () => {
		occSeqRef.current += 1;
		if (occTimerRef.current !== null) {
			window.clearTimeout(occTimerRef.current);
			occTimerRef.current = null;
		}
		occTimerRef.current = window.setTimeout(() => {
			occTimerRef.current = null;
			void runOccurrences();
		}, 250);
	};

	return {
		occSeqRef,
		occTimerRef,
		occPosRef,
		clearOccurrences,
		runOccurrences,
		scheduleOccurrences,
	};
}
