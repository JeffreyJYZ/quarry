//! The live document length the crash log needs.
//!
//! A CodeMirror range error names the changeset it choked on, not the document it was built
//! against, and the two are what a fix has to compare. The failing update never reaches its own
//! listener, so the length recorded here is the last successful one — the document the broken
//! changeset was computed from.
//!
//! Keyed by view rather than stored as a single number because a split shows two editors: the last
//! one that updated (or mounted) is the one a keystroke was aimed at, and closing it must not leave
//! its length behind as a neighbour's.

const lengths = new Map<object, number>();
let last: object | null = null;

/// Remember the length an editor now holds; called on mount and on every update.
export function trackDocumentLength(editor: object, length: number): void {
	lengths.set(editor, length);
	last = editor;
}

/// Forget an editor that unmounted, so its stale length is never reported for another one.
export function forgetDocumentLength(editor: object): void {
	lengths.delete(editor);
	if (last === editor) last = lengths.keys().next().value ?? null;
}

/** The length of the most recently used editor, or null when none is mounted. */
export function currentDocumentLength(): number | null {
	if (last === null) return null;
	return lengths.get(last) ?? null;
}

/**
 * Drop every editor. The window reload restarts this module, so production never calls it; tests
 * share one module instance and call it to start from "nothing mounted".
 */
export function forgetAllDocumentLengths(): void {
	lengths.clear();
	last = null;
}
