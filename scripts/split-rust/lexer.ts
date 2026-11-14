/**
 * Just enough of a Rust lexer to count braces honestly.
 *
 * Strings, raw strings, character literals and block comments can all span a line, so the state has
 * to survive the line boundary; a brace inside one of them must not move the depth.
 */

/** Lexer state that has to survive a line boundary: strings and block comments can span lines. */
export type LexState = {
	inString: boolean;
	inRaw: number | null;
	inBlockComment: number;
	inChar: boolean;
};

export function blankLiterals(line: string, state: LexState): string {
	let out = "";
	let index = 0;
	while (index < line.length) {
		const char = line[index];
		const next = line[index + 1];
		if (state.inBlockComment > 0) {
			if (char === "/" && next === "*") {
				state.inBlockComment += 1;
				index += 2;
				continue;
			}
			if (char === "*" && next === "/") {
				state.inBlockComment -= 1;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}
		if (state.inRaw !== null) {
			const closer = `"${"#".repeat(state.inRaw)}`;
			if (line.startsWith(closer, index)) {
				index += closer.length;
				state.inRaw = null;
				continue;
			}
			index += 1;
			continue;
		}
		if (state.inString) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === '"') state.inString = false;
			index += 1;
			continue;
		}
		if (state.inChar) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "'") state.inChar = false;
			index += 1;
			continue;
		}
		if (char === "/" && next === "/") break;
		if (char === "/" && next === "*") {
			state.inBlockComment = 1;
			index += 2;
			continue;
		}
		if (char === "r" && (next === '"' || next === "#")) {
			const match = line.slice(index).match(/^r(#*)"/);
			if (match) {
				const hashes = match[1].length;
				const rest = line.slice(index + 2 + hashes);
				const end = rest.indexOf(`"${"#".repeat(hashes)}`);
				if (end === -1) {
					state.inRaw = hashes;
					return out;
				}
				index += 2 + hashes + end + 1 + hashes;
				continue;
			}
		}
		if (char === '"') {
			state.inString = true;
			index += 1;
			continue;
		}
		if (char === "'") {
			// A character literal — `'a'`, `'\n'` — but not a lifetime like `'static`.
			const literal = line.slice(index).match(/^'(?:\\.|[^'\\])'/);
			if (literal !== null) {
				index += literal[0].length;
				continue;
			}
		}
		out += char;
		index += 1;
	}
	return out;
}
