/** One open file held in memory, independent of every other tab. */
export type FileBuffer = {
	path: string;
	name: string;
	/** In-memory text, mutated by the editor. */
	text: string;
	/** Text as it was read from disk or last written; the dirty marker compares against this. */
	loaded: string;
	/** How many times disk has replaced `text`; part of the identity the editor keys a fresh history on. */
	loadId?: number;
};

export function isDirty(buffer: FileBuffer): boolean {
	return buffer.text !== buffer.loaded;
}

/**
 * The buffers after the editor reported `text` for `path`.
 *
 * Identity is the point: the same array comes back when the path is not open or the text it already
 * holds was reported again, which is what an external reload echoes through the editor. Only the
 * buffer that actually changed is replaced, so every other tab keeps its identity.
 */
export function withBufferText(
	buffers: FileBuffer[],
	path: string | null,
	text: string,
): FileBuffer[] {
	if (path === null) return buffers;
	const index = buffers.findIndex((buffer) => buffer.path === path);
	const buffer = index === -1 ? undefined : buffers[index];
	if (buffer === undefined || buffer.text === text) return buffers;
	const next = buffers.slice();
	next[index] = { ...buffer, text };
	return next;
}

/** The buffer after a successful write: in-memory text and saved text agree, so the dot clears. */
export function markSaved(buffer: FileBuffer, text: string): FileBuffer {
	return { ...buffer, text, loaded: text };
}

/**
 * The live buffer once a write that started from `writtenFrom` reached the disk as `saved`.
 *
 * Text typed while the write was in flight stays in memory and stays dirty: `loaded` is what the
 * disk holds, so a save can never report clean over an edit it never wrote.
 */
export function settleSave(live: FileBuffer, writtenFrom: string, saved: string): FileBuffer {
	return live.text === writtenFrom ? markSaved(live, saved) : { ...live, loaded: saved };
}

/**
 * One document, as the editor sees it: a path plus the number of times disk replaced its text.
 *
 * The surface keys its view on this, so a disk reload disposes the old view instead of letting an
 * undo walk back into text that was never on disk. A tab switch disposes the view too, and the
 * per-document state cache is what brings its undo history, caret and scroll back.
 */
export function documentId(buffer: Pick<FileBuffer, "path" | "loadId">): string {
	return `${buffer.path}#${buffer.loadId ?? 0}`;
}
