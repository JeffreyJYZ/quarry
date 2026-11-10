/**
 * The open buffer's markers, found with the project scan's own pattern.
 *
 * The TODO window learns its markers from ripgrep; the gutter cannot make that round trip for every
 * keystroke, so it runs the same `TODO_PATTERN` over the text it already holds. The pattern is
 * imported rather than restated, so the gutter and the window can never disagree about what a
 * marker is.
 */

import { TODO_PATTERN } from "./model";

export type TodoComment = {
	/** 1-based line, the same numbering the panel's rows use. */
	line: number;
	/** The marker word itself: `TODO`, `FIXME`, `HACK` or `XXX`. */
	kind: string;
	/** What follows the marker, trimmed of the separators that say nothing in a tooltip. */
	text: string;
};

/** One line at a time; not global, so `exec` always starts at the beginning. */
const LINE_PATTERN = new RegExp(TODO_PATTERN);

/** `TODO: fix it` reads as `TODO fix it` — the punctuation between them carries no meaning. */
function commentAfter(line: string, index: number, length: number): string {
	return line
		.slice(index + length)
		.replace(/\s*\*\/\s*$/, "")
		.replace(/^[:\-–—\s]+/, "")
		.trim();
}

/** The hover text: the kind, then the comment when there is one. */
export function todoTooltip(marker: TodoComment): string {
	return marker.text === "" ? marker.kind : `${marker.kind} ${marker.text}`;
}

/**
 * Every line carrying a marker, ascending, at most one entry per line.
 *
 * A line with two markers is one place to jump to, which is the same rule the panel applies when it
 * groups a scan by line; the first marker on the line is the one the gutter reports.
 */
export function todoLines(text: string): TodoComment[] {
	if (text === "") return [];
	const found: TodoComment[] = [];
	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const match = LINE_PATTERN.exec(line);
		if (match === null) continue;
		found.push({
			line: index + 1,
			// The opener and its whitespace are every non-word character in front of the marker.
			kind: match[0].replace(/^\W+/, ""),
			text: commentAfter(line, match.index, match[0].length),
		});
	}
	return found;
}
