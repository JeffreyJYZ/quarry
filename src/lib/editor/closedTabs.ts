import type { FileBuffer } from "@/lib/project/buffer";

/**
 * The tab that was closed last.
 *
 * One slot, module-scoped, because "reopen" is one step back and not a history: a second close
 * replaces the first. It keeps the whole buffer, text included, so a discarded tab comes back with
 * what it held rather than re-read from disk — the edits were the point of reopening it.
 */
let closed: FileBuffer | null = null;

export function rememberClosed(buffer: FileBuffer): void {
	closed = buffer;
}

/** Takes the slot, leaving nothing behind: one reopen per close. */
export function takeClosed(): FileBuffer | null {
	const buffer = closed;
	closed = null;
	return buffer;
}

/** Drops the slot, for a project change where a buffer from the old root is meaningless. */
export function forgetClosed(): void {
	closed = null;
}
