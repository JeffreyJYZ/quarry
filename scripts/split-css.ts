/**
 * Splits a stylesheet into files of at most 200 lines, so the repository's size rule holds for CSS
 * too. Rules are never cut in half: the file is parsed into top-level blocks (a rule, or a whole
 * `@media` group) and blocks are packed greedily into parts.
 *
 * The original path becomes an index of `@import` statements, which keeps the cascade order.
 *
 * Usage: bun scripts/split-css.ts src/ui/styles.css [more.css ...]
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const LIMIT = 200;
const MAX_NAME = 28;

type Block = { text: string; lines: number };

function splitBlocks(source: string): Block[] {
	const lines = source.split("\n");
	const blocks: Block[] = [];
	let current: string[] = [];
	let depth = 0;

	const flush = () => {
		while (current.length > 0 && current[current.length - 1].trim() === "") current.pop();
		if (current.length === 0) return;
		blocks.push({ text: current.join("\n"), lines: current.length });
		current = [];
	};

	for (const line of lines) {
		for (const char of line) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
		current.push(line);
		// A top-level rule ends where its brace closes; a blank line at the top level ends a block
		// too, which covers comments and plain declarations.
		if (depth === 0 && (line.trim().endsWith("}") || line.trim() === "")) flush();
	}
	flush();
	return blocks;
}

function nameFor(block: Block, index: number): string {
	const selector = block.text
		.split("\n")
		.find((line) => line.trim() !== "" && !line.trim().startsWith("/*"))
		?.trim();
	const token = selector?.match(/[.#:][A-Za-z][\w-]*/)?.[0].replace(/^[.#:]/, "");
	if (token === undefined) return `part-${index}`;
	return token
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.slice(0, MAX_NAME);
}

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (files.length === 0) {
	console.error("usage: bun scripts/split-css.ts <file.css> [...]");
	process.exit(1);
}

for (const file of files) {
	const source = readFileSync(file, "utf8");
	const blocks = splitBlocks(source);
	const dir = join(dirname(file), basename(file, ".css"));
	mkdirSync(dir, { recursive: true });

	// Keep a hand-written header (everything before the first selector) in the index file.
	const header = source.startsWith("/*") ? source.slice(0, source.indexOf("*/") + 2) : "";

	const parts: { name: string; body: string[] }[] = [];
	let current: { name: string; body: string[]; lines: number } | null = null;

	blocks.forEach((block, index) => {
		const fits = current !== null && current.lines + block.lines + 2 <= LIMIT;
		if (!fits) {
			const name = nameFor(block, index + 1);
			const unique = `${parts.length + 1}-${name}`;
			current = { name: unique, body: [], lines: 0 };
			parts.push({ name: unique, body: current.body });
		}
		if (current === null) return;
		current.body.push(block.text, "");
		current.lines += block.lines + 1;
	});

	for (const part of parts) {
		writeFileSync(join(dir, `${part.name}.css`), `${part.body.join("\n").trimEnd()}\n`);
	}

	const index = [
		header,
		"/* Split by section. Order matters: the cascade follows these imports. */",
		...parts.map((part) => `@import "./${basename(file, ".css")}/${part.name}.css";`),
		"",
	]
		.filter((line) => line !== "")
		.join("\n\n");

	writeFileSync(`${file}.new`, `${index}\n`);
	renameSync(`${file}.new`, file);
	console.log(`${file}: ${parts.length} parts (${blocks.length} blocks)`);
}
