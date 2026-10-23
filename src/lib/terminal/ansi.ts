/**
 * Terminal text handling: line feeding, and SGR colour parsing.
 *
 * The PTY sends bytes, so a line arrives full of escape sequences. Left alone they render as literal
 * `[32m` noise next to a prompt; the run parser turns them into styles and drops every other control
 * sequence, and the feeder gives `\r` its real meaning (return to column zero, overwrite).
 */
import { BLANK, type Run, applySgr } from "@/lib/terminal/sgr";

export type { Run } from "@/lib/terminal/sgr";

/**
 * One line of terminal text split into styled runs.
 *
 * Only SGR (`ESC [ … m`) changes style; every other CSI, OSC and single-character escape is dropped,
 * because none of them mean anything to a read-only `<pre>`.
 */
export function parseAnsi(line: string): Run[] {
	const runs: Run[] = [];
	let style = { ...BLANK };
	let buffer = "";
	const pushText = () => {
		if (buffer !== "") {
			runs.push({ ...style, text: buffer });
			buffer = "";
		}
	};

	let index = 0;
	while (index < line.length) {
		const char = line[index];
		if (char !== "\u001b") {
			buffer += char;
			index += 1;
			continue;
		}
		pushText();
		const nextChar = line[index + 1];
		if (nextChar === "[") {
			// A CSI runs from ESC [ through its final byte (0x40–0x7E); everything before it is
			// parameter and intermediate bytes. "m" is only the final byte for SGR.
			let cursor = index + 2;
			while (cursor < line.length) {
				const code = line.charCodeAt(cursor);
				if (code >= 0x40 && code <= 0x7e) break;
				cursor += 1;
			}
			const finalByte = line[cursor] ?? "";
			const body = line.slice(index + 2, cursor);
			if (finalByte === "m") {
				const params = body
					.split(";")
					.filter((part) => part !== "")
					.map((part) => Number(part));
				style = applySgr(style, params.length === 0 ? [0] : params);
			}
			index = cursor + 1;
			continue;
		}
		if (nextChar === "]") {
			// OSC ends with BEL or ST; both are safe to skip entirely.
			const bel = line.indexOf("\u0007", index);
			const st = line.indexOf("\u001b\\", index);
			const ends = [bel, st].filter((value) => value !== -1);
			index =
				ends.length === 0 ? line.length : Math.min(...ends) + (ends.includes(st) ? 2 : 1);
			continue;
		}
		index += 2;
	}
	pushText();
	return runs.length === 0 ? [{ ...BLANK, text: "" }] : runs;
}

/**
 * Appends a PTY chunk to the scrollback.
 *
 * `\n` starts a new line; `\r` returns to column zero of the current one, so a progress bar or a
 * redrawn prompt replaces its predecessor instead of printing a second copy.
 */
export function feedChunk(lines: string[], data: string): string[] {
	const next = [...lines];
	if (next.length === 0) next.push("");
	let column = (next[next.length - 1] ?? "").length;
	for (const char of data) {
		if (char === "\n") {
			next.push("");
			column = 0;
			continue;
		}
		if (char === "\r") {
			column = 0;
			continue;
		}
		if (char === "\b") {
			column = Math.max(0, column - 1);
			continue;
		}
		const current = next[next.length - 1] ?? "";
		if (column >= current.length) {
			next[next.length - 1] = `${current}${" ".repeat(column - current.length)}${char}`;
		} else {
			next[next.length - 1] =
				`${current.slice(0, column)}${char}${current.slice(column + 1)}`;
		}
		column += 1;
	}
	return next;
}
