import { useCallback, useState } from "react";

// Module-scoped so a tab switch (DebugDockBody unmount/remount) keeps the user's widths.
let framesWidth = 260;
let breakpointsWidth = 240;

/** Widths for the debug dock's resizable columns, shared across remounts. */
export function useDebugDockWidths(): {
	framesWidth: number;
	setFramesWidth: (next: number) => void;
	breakpointsWidth: number;
	setBreakpointsWidth: (next: number) => void;
} {
	const [frames, setFrames] = useState(framesWidth);
	const [breakpoints, setBreakpoints] = useState(breakpointsWidth);

	const setFramesWidth = useCallback((next: number) => {
		framesWidth = next;
		setFrames(next);
	}, []);

	const setBreakpointsWidth = useCallback((next: number) => {
		breakpointsWidth = next;
		setBreakpoints(next);
	}, []);

	return {
		framesWidth: frames,
		setFramesWidth,
		breakpointsWidth: breakpoints,
		setBreakpointsWidth,
	};
}
