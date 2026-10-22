/** One open file held in memory, independent of every other tab. */
export type FileBuffer = {
	path: string;
	name: string;
	/** In-memory text, mutated by the editor. */
	text: string;
	/** Text as it was read from disk; the dirty marker compares against this. */
	loaded: string;
};

export function isDirty(buffer: FileBuffer): boolean {
	return buffer.text !== buffer.loaded;
}
