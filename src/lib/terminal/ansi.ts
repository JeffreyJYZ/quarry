/**
 * Terminal line feeding.
 *
 * The panel draws through xterm now, so this file keeps only the scrollback model: the line list
 * behind "copy all scrollback", fed one raw chunk at a time.
 */

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
