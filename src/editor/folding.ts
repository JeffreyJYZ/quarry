export type FoldRange = { from: number; to: number };

const OPEN_BRACKETS = new Set(["(", "[", "{"]);
const CLOSE_BRACKETS = new Set([")", "]", "}"]);
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const PAIRS_REV: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function findMatchingBracket(text: string, pos: number): number {
	if (pos < 0 || pos >= text.length) return -1;
	const ch = text[pos];
	let open: string;
	let close: string;
	let forward: boolean;
	if (OPEN_BRACKETS.has(ch)) {
		open = ch;
		close = PAIRS[ch];
		forward = true;
	} else if (CLOSE_BRACKETS.has(ch)) {
		open = PAIRS_REV[ch];
		close = ch;
		forward = false;
	} else return -1;

	if (forward) {
		let depth = 0;
		for (let i = pos; i < text.length; i += 1) {
			const c = text[i];
			if (c === open) depth += 1;
			else if (c === close) {
				depth -= 1;
				if (depth === 0) return i;
			}
		}
		return -1;
	}
	let depth = 0;
	for (let i = pos; i >= 0; i -= 1) {
		const c = text[i];
		if (c === close) depth += 1;
		else if (c === open) {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}

export function foldRangeForLine(text: string, lineNumber: number): FoldRange | null {
	const lines = text.split("\n");
	if (lineNumber < 1 || lineNumber > lines.length) return null;
	const idx = lineNumber - 1;
	const line = lines[idx];
	const openPos = line.lastIndexOf("{");
	if (openPos === -1) return null;
	if (line.slice(openPos + 1).trim() !== "") return null;

	let depth = 0;
	let started = false;
	for (let i = idx; i < lines.length; i += 1) {
		const l = lines[i];
		for (let j = 0; j < l.length; j += 1) {
			const c = l[j];
			if (c === "{") {
				depth += 1;
				started = true;
			} else if (c === "}") {
				depth -= 1;
				if (started && depth === 0) {
					// from = end of opening line (inclusive newline), to = start of closing line
					let openingEnd = 0;
					for (let k = 0; k <= idx; k += 1)
						openingEnd += lines[k].length + (k < lines.length - 1 ? 1 : 0);
					let closingStart = 0;
					for (let k = 0; k < i; k += 1) closingStart += lines[k].length + 1;
					if (closingStart <= openingEnd) return null;
					return { from: openingEnd, to: closingStart };
				}
			}
		}
	}
	return null;
}
