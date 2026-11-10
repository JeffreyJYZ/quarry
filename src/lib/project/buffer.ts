/** The encodings the backend reads and writes, named exactly as it labels them. */
export type FileEncoding = "utf8" | "utf8-bom" | "utf16-le" | "utf16-be" | "gb18030";

/** One open file held in memory, independent of every other tab. */
export type FileBuffer = {
	path: string;
	name: string;
	/** In-memory text, mutated by the editor. */
	text: string;
	/** Text as it was read from disk or last written; the dirty marker compares against this. */
	loaded: string;
	/**
	 * The encoding the file was read in, carried on the buffer itself rather than in a map keyed by
	 * path: a rename, a reload or a project switch can never attach another file's encoding to it.
	 */
	encoding?: FileEncoding;
	/** How many times disk has replaced `text`; part of the identity the editor keys a fresh history on. */
	loadId?: number;
};

/** How an encoding is named to the user. */
export function encodingLabel(encoding: FileEncoding): string {
	switch (encoding) {
		case "utf8-bom":
			return "UTF-8 with BOM";
		case "utf16-le":
			return "UTF-16 LE";
		case "utf16-be":
			return "UTF-16 BE";
		case "gb18030":
			return "GB18030";
		default:
			return "UTF-8";
	}
}

/** Whether a file in this encoding is worth telling the user about: a BOM is still UTF-8. */
export function isLegacyEncoding(encoding: FileEncoding | undefined): boolean {
	return encoding !== undefined && encoding !== "utf8" && encoding !== "utf8-bom";
}

/**
 * The one-line notice for a file that is not plain UTF-8, or `null` when it is.
 *
 * A save keeps the encoding, so saying it once on open is the whole message: the user learns the
 * file is not UTF-8 without a dialog, and the status bar carries the label afterwards.
 */
export function encodingNotice(name: string, encoding: FileEncoding | undefined): string | null {
	if (!isLegacyEncoding(encoding) || encoding === undefined) return null;
	const label = encodingLabel(encoding);
	return `${name}: opened as ${label}, saves keep ${label}`;
}

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
