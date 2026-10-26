import { formatDocument, formatterFor, writeTextFile } from "@/lib/project/api";
import { type FileBuffer, markSaved } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";

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
function extensionOf(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function baseName(path: string): string {
	const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return slash >= 0 ? path.slice(slash + 1) : path;
}

export function formatJsonText(text: string, name: string): string {
	const lines = text.split("\n");
	let indent: string = "\t";
	let sawTab = false;
	let spaceCount = 0;
	for (const line of lines) {
		const match = line.match(/^(\t+| +)/);
		if (!match) continue;
		const leading = match[1];
		if (leading.startsWith("\t")) {
			sawTab = true;
		} else if (spaceCount === 0) {
			spaceCount = leading.length;
		}
	}
	if (sawTab) {
		indent = "\t";
	} else if (spaceCount >= 4) {
		indent = "    ";
	} else if (spaceCount === 2) {
		indent = "  ";
	} else if (spaceCount > 0) {
		indent = " ".repeat(spaceCount);
	} else {
		indent = "  ";
	}

	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`cannot format ${name}: invalid JSON`);
	}

	let formatted = JSON.stringify(value, null, indent);
	if (text.endsWith("\n") && !formatted.endsWith("\n")) {
		formatted += "\n";
	}
	if (!text.endsWith("\n") && formatted.endsWith("\n")) {
		formatted = formatted.replace(/\n$/, "");
	}
	return formatted;
}

export async function saveBuffer(root: string, buffer: FileBuffer): Promise<SaveOutcome> {
	let text = buffer.text;
	let warning: string | null = null;
	const ext = extensionOf(buffer.path);

	if (ext === "json" || ext === "jsonc") {
		try {
			text = formatJsonText(buffer.text, baseName(buffer.path));
		} catch (error) {
			text = buffer.text;
			warning = `${baseName(buffer.path)}: ${describeError(error)}`;
		}
		await writeTextFile(buffer.path, text);
		return { buffer: markSaved(buffer, text), warning };
	}

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
