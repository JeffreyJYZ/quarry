import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { PANEL_STEP, PANEL_STEP_LARGE } from "@/lib/layout/model";
import "@/ui/layout/layout.css";

export type SplitterProps = {
	/** Axis the handle lies along: "x" for a vertical bar between a left and a right pane. */
	axis: "x" | "y";
	/** Current size in px of the pane the handle resizes. */
	value: number;
	min: number;
	max: number;
	/** True when dragging toward the start of the axis grows the pane (a right-hand or bottom pane). */
	invert?: boolean;
	/** Accessible name, e.g. "Resize explorer". */
	label: string;
	onChange: (next: number) => void;
};

type DragState = {
	pointerId: number;
	start: number;
	startValue: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * A draggable border between two panes.
 *
 * Pointer moves report a size, never a position, so the caller keeps ownership of the value; the
 * drag only remembers where it started. Keyboard control mirrors the drag for anyone who cannot use
 * a pointer, and a stuck `col-resize` cursor after a lost pointer is prevented by restoring the
 * document styles on release, on cancel and on unmount.
 */
export default function Splitter({
	axis,
	value,
	min,
	max,
	invert = false,
	label,
	onChange,
}: SplitterProps): JSX.Element {
	const drag = useRef<DragState | null>(null);
	const [dragging, setDragging] = useState(false);

	const endDrag = useCallback(() => {
		const state = drag.current;
		if (state === null) return;
		drag.current = null;
		setDragging(false);
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	}, []);

	useEffect(() => endDrag, [endDrag]);

	const report = useCallback(
		(next: number) => {
			const clamped = clamp(next, min, max);
			if (clamped !== value) onChange(clamped);
		},
		[max, min, onChange, value],
	);

	return (
		<div
			className={["splitter", `splitter-${axis}`, dragging ? "dragging" : ""]
				.filter(Boolean)
				.join(" ")}
			role="separator"
			aria-orientation={axis === "x" ? "vertical" : "horizontal"}
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = {
					pointerId: event.pointerId,
					start: axis === "x" ? event.clientX : event.clientY,
					startValue: value,
				};
				setDragging(true);
				document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
				document.body.style.userSelect = "none";
			}}
			onPointerMove={(event) => {
				const state = drag.current;
				if (state === null || state.pointerId !== event.pointerId) return;
				const current = axis === "x" ? event.clientX : event.clientY;
				const delta = (current - state.start) * (invert ? -1 : 1);
				report(state.startValue + delta);
			}}
			onPointerUp={(event) => {
				const state = drag.current;
				if (state !== null && state.pointerId === event.pointerId) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
				endDrag();
			}}
			onPointerCancel={endDrag}
			onLostPointerCapture={endDrag}
			onKeyDown={(event) => {
				const [back, forward] =
					axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
				const step = event.shiftKey ? PANEL_STEP_LARGE : PANEL_STEP;
				const direction = invert ? -1 : 1;
				if (event.key === back) {
					event.preventDefault();
					report(value - step * direction);
					return;
				}
				if (event.key === forward) {
					event.preventDefault();
					report(value + step * direction);
					return;
				}
				if (event.key === "Home") {
					event.preventDefault();
					report(min);
					return;
				}
				if (event.key === "End") {
					event.preventDefault();
					report(max);
				}
			}}
		/>
	);
}
