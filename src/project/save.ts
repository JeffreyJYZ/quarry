import { formatDocument, formatterFor, writeTextFile } from "@/project/api";
import { type FileBuffer, markSaved } from "@/project/buffer";
import { describeError } from "@/project/errors";

export type SaveOutcome = {
	/** The buffer as persisted: text and saved text both match what reached the disk. */
	buffer: FileBuffer;
	/** One line when the file was written unformatted, otherwise `null`. */
	warning: string | null;
};

/**
 * Formats when the path has a formatter, then writes.
 *
 * The formatted text only reaches the buffer once the write resolved, and a failed write rejects
 * with the buffer untouched, so an error never costs the user their edit.
 */
export async function saveBuffer(root: string, buffer: FileBuffer): Promise<SaveOutcome> {
	let text = buffer.text;
	let warning: string | null = null;
	let formatter = "";

	try {
		formatter = await formatterFor(buffer.path);
	} catch (error) {
		warning = `formatter unavailable, wrote unformatted: ${describeError(error)}`;
	}

	if (formatter !== "") {
		try {
			text = await formatDocument(root, buffer.path, buffer.text);
		} catch (error) {
			text = buffer.text;
			warning = `${formatter} failed, wrote unformatted: ${describeError(error)}`;
		}
	}

	await writeTextFile(buffer.path, text);

	return { buffer: markSaved(buffer, text), warning };
}

/** The transient status line for one save: `Saved <name>`, plus a formatting warning if any. */
export function saveMessage(name: string, warning: string | null): string {
	return warning === null ? `Saved ${name}` : `Saved ${name} · ${warning}`;
}

export function saveErrorMessage(name: string, error: unknown): string {
	return `Could not save ${name}: ${describeError(error)}`;
}
