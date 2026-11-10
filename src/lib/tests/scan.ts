/**
 * The Rust declarations the test gutter needs, read from one file's text.
 *
 * This is deliberately not a parser: it records every `fn` with the chain of `mod` blocks around
 * it, and every `mod` header with its line, so a backend test name can be matched to a line. Braces
 * inside comments, strings, characters and raw strings are removed first, so a `{` in a message
 * never shifts the module stack.
 */

/** One `fn` declaration and the module names enclosing it, outermost first. */
export type FnLine = { line: number; name: string; mods: string[] };

/** One `mod name {` header; `path` is the whole chain and `depth` the brace depth it opened at. */
export type ModLine = { line: number; name: string; path: string[]; depth: number };

export type Declarations = { fns: FnLine[]; mods: ModLine[] };

const MOD_HEADER = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*\{/;
const FN_HEADER =
	/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/;

/** Every `fn` and `mod {` in the text, with the module chain that encloses each one. */
export function scanTestFile(text: string): Declarations {
	const fns: FnLine[] = [];
	const mods: ModLine[] = [];
	const stack: ModLine[] = [];
	let depth = 0;
	let blockComment = false;
	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const stripped = stripLine(lines[index] ?? "", blockComment);
		blockComment = stripped.block;
		const code = stripped.code;
		const mod = MOD_HEADER.exec(code);
		const modName = mod?.[1];
		if (modName !== undefined) {
			const path = [...stack.map((entry) => entry.name), modName];
			const header: ModLine = { line: index + 1, name: modName, path, depth };
			stack.push(header);
			mods.push(header);
		}
		const fnName = FN_HEADER.exec(code)?.[1];
		if (fnName !== undefined) {
			fns.push({ line: index + 1, name: fnName, mods: stack.map((entry) => entry.name) });
		}
		depth += count(code, "{") - count(code, "}");
		while (stack.length > 0 && depth <= (stack[stack.length - 1] as ModLine).depth) {
			stack.pop();
		}
	}
	return { fns, mods };
}

/** One source line with comments dropped and literal contents cut out of the code. */
export type Stripped = { code: string; block: boolean };

/**
 * The line's code only.
 *
 * `block` carries an unterminated block comment to the next line, which is the one piece of state a
 * single line cannot hold on its own.
 */
export function stripLine(line: string, inBlock: boolean): Stripped {
	let code = "";
	let block = inBlock;
	let index = 0;
	while (index < line.length) {
		const char = line[index] as string;
		const next = line[index + 1];
		if (block) {
			if (char === "*" && next === "/") {
				block = false;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}
		if (char === "/" && next === "/") break;
		if (char === "/" && next === "*") {
			block = true;
			index += 2;
			continue;
		}
		const rawEnd = char === "r" ? rawStringEnd(line, index) : null;
		if (rawEnd !== null) {
			index = rawEnd;
			continue;
		}
		if (char === '"') {
			index = quotedEnd(line, index, '"');
			continue;
		}
		if (char === "'" && isCharLiteral(line, index)) {
			index = quotedEnd(line, index, "'");
			continue;
		}
		code += char;
		index += 1;
	}
	return { code, block };
}

function count(text: string, char: string): number {
	return text.split(char).length - 1;
}

/** Index just past a quoted literal, or the line's end when it never closes on this line. */
function quotedEnd(line: string, start: number, quote: string): number {
	let index = start + 1;
	while (index < line.length) {
		const char = line[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		if (char === quote) return index + 1;
		index += 1;
	}
	return line.length;
}

/** A `'x'` or `'\n'` character literal, as opposed to a lifetime such as `&'a str`. */
function isCharLiteral(line: string, start: number): boolean {
	const next = line[start + 1];
	if (next === "\\") return line[start + 3] === "'";
	return next !== undefined && next !== "'" && line[start + 2] === "'";
}

/** Index just past `r"…"` / `r#"…"#`, or null when the `r` starts something else. */
function rawStringEnd(line: string, start: number): number | null {
	let index = start + 1;
	let hashes = 0;
	while (line[index] === "#") {
		hashes += 1;
		index += 1;
	}
	if (line[index] !== '"') return null;
	const close = `"${"#".repeat(hashes)}`;
	const end = line.indexOf(close, index + 1);
	return end === -1 ? line.length : end + close.length;
}
