/**
 * The GoogleTest macro lines in a C++ file, so a backend case can be given a line.
 *
 * This is not a parser: it records the `TEST`/`TEST_F`/`TYPED_TEST` header on each line, with the
 * suite and case it declares. Comments and string literals are stripped first, so a macro quoted in
 * prose never places a marker.
 */

import { stripLine } from "@/lib/tests/scan";

/** One test macro: the suite and case it declares, and the 1-based line it sits on. */
export type CppTestLine = { line: number; suite: string; name: string };

const MACRO = /^\s*(?:TEST|TEST_F|TYPED_TEST)\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)/;

/** Every `TEST(Suite, Name)`-shaped header in the text, in file order. */
export function scanCppTests(text: string): CppTestLine[] {
	const out: CppTestLine[] = [];
	const lines = text.split("\n");
	let block = false;
	for (let index = 0; index < lines.length; index += 1) {
		const stripped = stripLine(lines[index] ?? "", block);
		block = stripped.block;
		const match = MACRO.exec(stripped.code);
		const suite = match?.[1];
		const name = match?.[2];
		if (suite === undefined || name === undefined) continue;
		out.push({ line: index + 1, suite, name });
	}
	return out;
}
