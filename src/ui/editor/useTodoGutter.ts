import { useEffect, useRef } from "react";
import type { Compartment } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { setTodoComments, todoGutter } from "@/lib/todo/gutter";
import type { TodoComment } from "@/lib/todo/lines";

export type TodoGutterSlots = {
	viewRef: { current: EditorView | null };
	/** Holds the column; the mount creates it and the view dies with it. */
	gutterRef: { current: Compartment | null };
	/** Signature of the markers already written into the view. */
	markersRef: { current: string };
};

/**
 * Pushes the buffer's markers into the view.
 *
 * The column is mounted only while there is a marker to draw, which is why the compartment is
 * reconfigured as well as the field written; a file with no markers keeps no empty gutter. A
 * document change recomputes the marker list from the text, so the column follows the buffer.
 */
export function useTodoGutter(
	slots: TodoGutterSlots,
	markers: readonly TodoComment[],
	onOpen: ((marker: TodoComment) => void) | undefined,
): void {
	const { viewRef, gutterRef, markersRef } = slots;
	// The column is configured once; a later render's callback must still be the one it calls.
	const openRef = useRef(onOpen);
	openRef.current = onOpen;

	useEffect(() => {
		const view = viewRef.current;
		const compartment = gutterRef.current;
		if (view === null || compartment === null) return;
		const enabled = markers.length > 0;
		const signature = `${enabled ? "on" : "off"}:${markers
			.map((marker) => `${marker.line}:${marker.kind}:${marker.text}`)
			.join("|")}`;
		if (signature === markersRef.current) return;
		const wasEnabled = markersRef.current.startsWith("on");
		markersRef.current = signature;
		if (!enabled) {
			if (wasEnabled) view.dispatch({ effects: compartment.reconfigure([]) });
			return;
		}
		if (!wasEnabled) {
			view.dispatch({
				effects: compartment.reconfigure(todoGutter((marker) => openRef.current?.(marker))),
			});
		}
		view.dispatch({ effects: setTodoComments.of(markers) });
	}, [markers, viewRef, gutterRef, markersRef]);
}
