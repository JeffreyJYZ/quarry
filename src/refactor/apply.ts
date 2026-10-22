import type { FileEdit, TextEdit } from "@/project/api";
import { readTextFile, writeTextFile } from "@/project/api";
import type { FileBuffer } from "@/project/buffer";

function toOffset(text: string, line: number, character: number): number {
	const lines = text.split("\n");
	let offset = 0;
	for (let i = 0; i < line && i < lines.length; i += 1) {
		offset += lines[i].length + 1;
	}
	if (line < lines.length) {
		offset += Math.min(character, lines[line].length);
	}
	return offset;
}

function applyEdits(text: string, edits: TextEdit[]): string {
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

export async function applyFileEdits(
	edits: FileEdit[],
	buffers: FileBuffer[],
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void,
): Promise<{ files: number; failed: string[] }> {
	const failed: string[] = [];
	let files = 0;
	for (const fileEdit of edits) {
		const buffer = buffers.find((b) => b.path === fileEdit.path);
		if (buffer !== undefined) {
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
	return { files, failed };
}
