/**
 * The TODO list's model: one scan, grouped by file.
 *
 * The scan is the project search the palette already uses — the query below goes to ripgrep through
 * `searchProject`, so the markers are found on the backend and the frontend only groups what came
 * back. Nothing here reads a file.
 */

import type { SearchMatch } from "@/lib/project/api";
import { fileName } from "@/lib/project/paths";

/**
 * The one query the scan runs: a marker directly after a comment opener.
 *
 * Anchoring on the opener is what keeps a `TODO` inside a string literal out of the list, and it
 * covers every comment style the two supported languages use: a line comment, a block comment's
 * opening and continuation lines, and a hash comment. ripgrep is given an absolute pattern here, so
 * its smart case treats it as case-sensitive: the markers are upper-case by convention, and a
 * lowercase `todo` in prose is not one.
 */
export const TODO_PATTERN = "(?://|#|/\\*|\\*|<!--|--|;)\\s*(?:TODO|FIXME|HACK|XXX)\\b";

/** The markers the pattern lists, so the panel's empty state names them without a second copy. */
export const TODO_MARKERS = ["TODO", "FIXME", "HACK", "XXX"] as const;

/** Rows the scan keeps; a huge tree answers with its first markers and says so. */
export const TODO_MAX_RESULTS = 2000;

export type TodoRow = {
	/** 1-based, as ripgrep reports it; the click hands the editor a 0-based line. */
	line: number;
	/** The line's text, trimmed of the indentation that says nothing in a narrow row. */
	text: string;
};

export type TodoFile = {
	/** Absolute path, the key a group and the save hook compare on. */
	path: string;
	/** Last path segment, what the group header shows. */
	name: string;
	rows: TodoRow[];
};

/**
 * The matches as file groups: one row per line, files by path, rows by line.
 *
 * Ordering is the panel's contract — the list must not reshuffle between two scans of one tree —
 * so it is decided here rather than by whatever order ripgrep happened to emit.
 */
export function todoFiles(matches: SearchMatch[]): TodoFile[] {
	const byPath = new Map<string, TodoFile>();
	for (const match of matches) {
		const text = match.text.trim();
		if (text === "") continue;
		const existing = byPath.get(match.path);
		if (existing === undefined) {
			byPath.set(match.path, {
				path: match.path,
				name: fileName(match.path),
				rows: [{ line: match.line, text }],
			});
			continue;
		}
		// One row per line: a line that carries two markers is still one place to jump to.
		if (existing.rows.some((row) => row.line === match.line)) continue;
		existing.rows.push({ line: match.line, text });
	}
	const files = [...byPath.values()];
	for (const file of files) {
		file.rows.sort((left, right) => left.line - right.line);
	}
	files.sort((left, right) => left.path.localeCompare(right.path));
	return files;
}

/** Whether the list already names `path`, which is what makes a save worth a rescan. */
export function todoPathListed(files: TodoFile[], path: string): boolean {
	return files.some((file) => file.path === path);
}

/** One row against the filter, the way the Problems panel matches a diagnostic. */
export function matchesTodoText(file: TodoFile, row: TodoRow, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	return `${file.path} ${file.name} ${row.text}`.toLowerCase().includes(needle);
}

/** The groups narrowed to the rows that match, dropping a file left with none. */
export function filterTodoFiles(files: TodoFile[], query: string): TodoFile[] {
	const result: TodoFile[] = [];
	for (const file of files) {
		const rows = file.rows.filter((row) => matchesTodoText(file, row, query));
		if (rows.length > 0) {
			result.push({ path: file.path, name: file.name, rows });
		}
	}
	return result;
}

/** How many rows the list is showing, which is what the head's count must agree with. */
export function countTodos(files: TodoFile[]): number {
	let count = 0;
	for (const file of files) {
		count += file.rows.length;
	}
	return count;
}

/** Where a row's click lands: the editor takes a 0-based line and a character. */
export function todoTarget(row: TodoRow): { line: number; character: number } {
	return { line: row.line - 1, character: 0 };
}
