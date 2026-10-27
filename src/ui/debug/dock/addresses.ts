import type { DebugController, StopView } from "@/lib/debug/session";

/** The frame the memory pane follows: the selected one, else the top of the stack. */
export function activeFrame(view: StopView | null) {
	if (view === null) return null;
	return view.frames.find((frame) => frame.id === view.frameId) ?? view.frames[0] ?? null;
}

/** The address the memory pane opens at: the selected variable's, else the instruction pointer. */
export function memoryAddressOf(debug: DebugController): string | null {
	return (
		debug.selectedVariable?.memoryReference ??
		activeFrame(debug.stopView)?.instructionPointer ??
		null
	);
}

/** The address the disassembly pane opens at: always the active frame's instruction pointer. */
export function disasmAddressOf(debug: DebugController): string | null {
	return activeFrame(debug.stopView)?.instructionPointer ?? null;
}
