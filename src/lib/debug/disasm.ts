/**
 * The one way to ask for the assembly split.
 *
 * The split lives beside the editor while the request comes from the debugger dock, which is a
 * different subtree; the shell registers an opener here, so neither side has to drill a callback
 * through the dock's columns.
 */
type Opener = () => void;

let opener: Opener | null = null;

/** Registered by the shell; the split then follows the frame the dock has selected. */
export function setDisassemblyOpener(fn: Opener | null): void {
	opener = fn;
}

/** Open the assembly split at the selected frame. */
export function openDisassembly(): void {
	opener?.();
}
