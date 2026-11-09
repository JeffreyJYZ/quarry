import type { FileEdit, TextEdit } from "@/lib/project/api";
import { readTextFile, writeTextFile } from "@/lib/project/api";
import { type FileBuffer, isDirty } from "@/lib/project/buffer";
import { fileName } from "@/lib/project/paths";

/** A file the edit was not applied to, and the reason the user needs in order to act on it. */
export type RefusedEdit = { path: string; reason: string };

export type EditResult = {
	files: number;
	failed: string[];
	refused: RefusedEdit[];
};

/** One line naming the file that was left alone and why. */
export function refusalNotice(refused: RefusedEdit): string {
	return `Not applied to ${fileName(refused.path)}: ${refused.reason}`;
}

/**
 * The start offset of every line, counting `\r\n`, `\n` and a lone `\r` as one terminator each.
 *
 * Splitting on `\n` leaves the `\r` in the measured line, so a position on a CRLF line can land
 * inside the terminator instead of at the end of its text.
 */
function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (char === "\r") {
			if (text[i + 1] === "\n") i += 1;
			starts.push(i + 1);
		} else if (char === "\n") {
			starts.push(i + 1);
		}
	}
	return starts;
}

/** Where a line's own text stops: its first terminator, or the end of the text. */
function lineTextEnd(text: string, start: number): number {
	let end = start;
	while (end < text.length && text[end] !== "\r" && text[end] !== "\n") end += 1;
	return end;
}

/** The character offset of an LSP position, both separators accepted at the line ends. */
export function toOffset(text: string, line: number, character: number): number {
	const start = lineStarts(text)[line];
	if (start === undefined) return text.length;
	return Math.min(start + character, lineTextEnd(text, start));
}

/**
 * `text` with every edit applied, later positions first so an earlier offset stays valid.
 *
 * The line endings are the file's own: nothing here normalises `\r\n` to `\n`, because a rename
 * that rewrote them would turn a one-word change into a whole-file diff.
 */
export function applyEdits(text: string, edits: TextEdit[]): string {
	const sorted = [...edits].sort((a, b) => {
		if (a.range.start.line !== b.range.start.line) {
			return b.range.start.line - a.range.start.line;
		}
		if (a.range.start.character !== b.range.start.character) {
			return b.range.start.character - a.range.start.character;
		}
		return 0;
	});
	let result = text;
	for (const edit of sorted) {
		const from = toOffset(result, edit.range.start.line, edit.range.start.character);
		const to = toOffset(result, edit.range.end.line, edit.range.end.character);
		result = result.slice(0, from) + edit.newText + result.slice(to);
	}
	return result;
}

/**
 * Why this buffer is not the text the edit was computed against, or `null` when it is.
 *
 * An unsaved buffer is refused whatever the server declared: its live text is not what any edit
 * computed against disk describes. A declared version then has to match the one the server last
 * acknowledged for this path, so a rename that raced a `didChange` is refused instead of merged.
 */
function refusalReason(
	fileEdit: FileEdit,
	buffer: FileBuffer,
	versionOf: (path: string) => number | null,
): string | null {
	if (isDirty(buffer)) return "the buffer has unsaved changes";
	const declared = fileEdit.version;
	if (declared === undefined || declared === null) return null;
	const current = versionOf(fileEdit.path);
	if (current === null) return "the editor has no version record for it";
	if (current !== declared) {
		return `the server computed it against version ${declared}, the editor is at version ${current}`;
	}
	return null;
}

/**
 * Apply a `WorkspaceEdit`: open buffers in memory, every other file through disk.
 *
 * `versionOf` is the version the server last acknowledged for a path, so the caller decides where
 * that record lives; a refusal is reported per file rather than swallowed.
 */
export async function applyFileEdits(
	edits: FileEdit[],
	buffers: FileBuffer[],
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void,
	versionOf: (path: string) => number | null,
): Promise<EditResult> {
	const failed: string[] = [];
	const refused: RefusedEdit[] = [];
	let files = 0;
	for (const fileEdit of edits) {
		const buffer = buffers.find((b) => b.path === fileEdit.path);
		if (buffer !== undefined) {
			const reason = refusalReason(fileEdit, buffer, versionOf);
			if (reason !== null) {
				refused.push({ path: fileEdit.path, reason });
				continue;
			}
			const nextText = applyEdits(buffer.text, fileEdit.edits);
			setBuffers((current) =>
				current.map((b) => (b.path === fileEdit.path ? { ...b, text: nextText } : b)),
			);
			files += 1;
		} else {
			try {
				const text = await readTextFile(fileEdit.path);
				const nextText = applyEdits(text, fileEdit.edits);
				await writeTextFile(fileEdit.path, nextText);
				files += 1;
			} catch {
				failed.push(fileEdit.path);
			}
		}
	}
	return { files, failed, refused };
}
