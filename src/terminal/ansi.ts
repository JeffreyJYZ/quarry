/**
 * Terminal text handling: line feeding, and SGR colour parsing.
 *
 * The PTY sends bytes, so a line arrives full of escape sequences. Left alone they render as literal
 * `[32m` noise next to a prompt; the run parser turns them into styles and drops every other control
 * sequence, and the feeder gives `\r` its real meaning (return to column zero, overwrite).
 */

export type Run = {
	text: string;
	fg: string | null;
	bg: string | null;
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
};

const BLANK: Omit<Run, "text"> = {
	fg: null,
	bg: null,
	bold: false,
	dim: false,
	italic: false,
	underline: false,
};

/** The sixteen ANSI colours, in the theme's own palette. */
const BASIC = [
	"#3b4048",
	"#e06c75",
	"#7fc98f",
	"#d9b26a",
	"#5b8def",
	"#c678dd",
	"#56b6c2",
	"#d7dbe0",
	"#5c6370",
	"#ef8790",
	"#a3d9ad",
	"#e8c98d",
	"#7ea6f2",
	"#d79ce8",
	"#7fd0d9",
	"#ffffff",
];

function basicColour(index: number): string | null {
	if (index < 0 || index > 15) return null;
	return BASIC[index] ?? null;
}

/** `38;5;N` and `38;2;R;G;B` share a shape, so one reader handles both plus the plain `3x` forms. */
function readColour(params: number[], start: number): { colour: string | null; next: number } {
	const mode = params[start];
	if (mode === 5) {
		const index = params[start + 1];
		if (index === undefined || index < 0 || index > 255) {
			return { colour: null, next: start + 2 };
		}
		if (index < 16) return { colour: basicColour(index), next: start + 2 };
		if (index >= 232) {
			// The 24-step grey ramp.
			const level = 8 + (index - 232) * 10;
			return { colour: `rgb(${level} ${level} ${level})`, next: start + 2 };
		}
		const n = index - 16;
		const r = Math.floor(n / 36);
		const g = Math.floor((n % 36) / 6);
		const b = n % 6;
		const step = (value: number) => (value === 0 ? 0 : 55 + value * 40);
		return { colour: `rgb(${step(r)} ${step(g)} ${step(b)})`, next: start + 2 };
	}
	if (mode === 2) {
		const [r, g, b] = [params[start + 1], params[start + 2], params[start + 3]];
		if (r === undefined || g === undefined || b === undefined) {
			return { colour: null, next: start + 4 };
		}
		const clamp = (value: number) => Math.max(0, Math.min(255, value));
		return { colour: `rgb(${clamp(r)} ${clamp(g)} ${clamp(b)})`, next: start + 4 };
	}
	return { colour: null, next: start + 1 };
}

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
	// biome-ignore lint/suspicious/noControlCharactersInRegex: escape parsing is the point
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

function applySgr(style: Omit<Run, "text">, params: number[]): Omit<Run, "text"> {
	let out = { ...style };
	for (let index = 0; index < params.length; index += 1) {
		const param = params[index];
		if (param === 0) {
			out = { ...BLANK };
			continue;
		}
		if (param === 1) out.bold = true;
		else if (param === 2) out.dim = true;
		else if (param === 3) out.italic = true;
		else if (param === 4) out.underline = true;
		else if (param === 22) {
			out.bold = false;
			out.dim = false;
		} else if (param === 23) out.italic = false;
		else if (param === 24) out.underline = false;
		else if (param >= 30 && param <= 37) out.fg = basicColour(param - 30);
		else if (param >= 90 && param <= 97) out.fg = basicColour(param - 90 + 8);
		else if (param === 39) out.fg = null;
		else if (param >= 40 && param <= 47) out.bg = basicColour(param - 40);
		else if (param >= 100 && param <= 107) out.bg = basicColour(param - 100 + 8);
		else if (param === 49) out.bg = null;
		else if (param === 38 || param === 48) {
			const { colour, next } = readColour(params, index + 1);
			if (param === 38) out.fg = colour;
			else out.bg = colour;
			index = next - 1;
		}
	}
	return out;
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
