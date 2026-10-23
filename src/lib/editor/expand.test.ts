import { describe, expect, test } from "bun:test";
import type { EditorView } from "@codemirror/view";
import { expandBracketPair } from "@/lib/editor/commands";

type Change = { from: number; to: number; insert: string };
type Dispatch = { changes: Change; selection: { anchor: number } };

/** A stand-in for the editor view: the command only reads the document and dispatches one change. */
function fakeView(
	text: string,
	from: number,
	to = from,
	indent = "    ",
	lineText = "    fn main()",
) {
	const dispatched: Dispatch[] = [];
	const view = {
		state: {
			selection: { main: { empty: from === to, from, to } },
			sliceDoc: (start: number, end: number) => text.slice(start, end),
			doc: { lineAt: () => ({ text: lineText }) },
			facet: () => indent,
		},
		dispatch: (spec: Dispatch) => {
			dispatched.push(spec);
		},
	};
	return { view: view as unknown as EditorView, dispatched };
}

describe("expandBracketPair", () => {
	test("splits a curly pair onto three indented lines", () => {
		const text = "    fn main() {}";
		const { view, dispatched } = fakeView(text, text.indexOf("}"));
		expect(expandBracketPair(view)).toBe(true);
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0].changes.insert).toBe("\n        \n    ");
		expect(dispatched[0].selection.anchor).toBe(text.indexOf("}") + 1 + 8);
	});

	test("splits round and square pairs too", () => {
		for (const pair of ["()", "[]"]) {
			const text = `let value = ${pair};`;
			const { view, dispatched } = fakeView(
				text,
				text.indexOf(pair[1]),
				undefined,
				"    ",
				text,
			);
			expect(expandBracketPair(view)).toBe(true);
			expect(dispatched[0].changes.insert).toBe("\n    \n");
		}
	});

	test("leaves an ordinary newline alone outside a pair", () => {
		const text = "let value = 1;";
		const { view, dispatched } = fakeView(text, text.length);
		expect(expandBracketPair(view)).toBe(false);
		expect(dispatched).toHaveLength(0);
	});

	test("leaves a selection alone", () => {
		const text = "{}";
		const { view, dispatched } = fakeView(text, 1, 2);
		expect(expandBracketPair(view)).toBe(false);
		expect(dispatched).toHaveLength(0);
	});

	test("does not treat mismatched halves as a pair", () => {
		const text = "{)";
		const { view, dispatched } = fakeView(text, 1);
		expect(expandBracketPair(view)).toBe(false);
		expect(dispatched).toHaveLength(0);
	});
});
