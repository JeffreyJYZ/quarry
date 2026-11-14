import { describe, expect, test } from "bun:test";
import { closeBrackets } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import "@/test/dom";
import { cppEditing } from "@/lib/editor/cppEditing";
import { searchField, setSearchMatches } from "@/lib/editor/search";

/**
 * Reproduction of the C/C++ editing range crash.
 *
 * What the screenshot's message really is: `Position 61 is out of range for changeset of length 52`
 * is thrown by `ChangeSet.mapPos`, and the only live site in `src/` that maps stored positions is
 * the in-file search field, which re-publishes a match list measured on a longer document. The
 * third test pins that exact string.
 *
 * What `cppEditing` does: a typing transaction carrying more than one change can have one plan edit
 * collapse the range another change's caret sits in, and the whole transaction is rejected with a
 * different RangeError — `Selection points outside of document`, from `EditorState`'s own selection
 * check. The first test is that failure, and it is a transaction the filter must survive rather
 * than the app's live path: nothing in this app enables `EditorState.allowMultipleSelections`, so
 * every state collapses to one range (`@codemirror/state` `applyTransaction`) and a keystroke is a
 * one-change transaction.
 */

const extensions = () => [cpp(), closeBrackets(), cppEditing()];

const stateFor = (doc: string, caret: number): EditorState =>
	EditorState.create({ doc, selection: { anchor: caret }, extensions: extensions() });

const viewFor = (doc: string, caret: number): EditorView =>
	new EditorView({ state: stateFor(doc, caret), parent: document.body });

/** A typing transaction whose insertions are all in the start document's coordinates. */
function typeAt(view: EditorView, at: readonly number[], text: string): void {
	view.dispatch({
		changes: at.map((pos) => ({ from: pos, insert: text })),
		selection: { anchor: Math.max(...at) + text.length },
		userEvent: "input.type",
	});
}

describe("cppEditing reproduction", () => {
	test("a two-change typing transaction in a class body is applied, not rejected", () => {
		// The shape `class A {` + Enter leaves: a blank indented line inside the class and the
		// closeBrackets brace one line below. Inserting "}" at 21 (inside the class) and at 26
		// (before the waiting brace) makes the plan collapse 21..28 into "};" for the first change
		// while the second change's caret is 28, on a document that ends at 24.
		const view = viewFor("class A {\n    int x;\n    \n}\n", 21);
		expect(() => typeAt(view, [21, 26], "}")).not.toThrow();
		expect(view.state.selection.main.head).toBeLessThanOrEqual(view.state.doc.length);
		view.destroy();
	});

	test("the same two changes in a function body are applied", () => {
		// Control: the plan aligns the brace but has no scope to close, so the two changes stay
		// independent and the transaction applies.
		const view = viewFor("void f() {\n    int x;\n    \n}\n", 21);
		expect(() => typeAt(view, [21, 26], "}")).not.toThrow();
		expect(view.state.selection.main.head).toBeLessThanOrEqual(view.state.doc.length);
		view.destroy();
	});

	test("the single-change shapes from the report apply without throwing", () => {
		// Catalogue of what was tried and stayed inside the document: one change, one caret. `to` is
		// the caret the plan ends on and it never exceeded the document after the plan's own edits.
		const rows: { doc: string; from: number; to?: number; insert: string; expect: string }[] = [
			// A class body typed at the very end of a short document: plan inserts ";" at 21, caret 22.
			{
				doc: "class W {\n    int x;\n",
				from: 21,
				insert: "}",
				expect: "class W {\n    int x;\n};",
			},
			// The same for a function body, which gains no semicolon.
			{
				doc: "void f() {\n    int x = 1;\n",
				from: 26,
				insert: "}",
				expect: "void f() {\n    int x = 1;\n}",
			},
			// closeBrackets' pair: one change inserting "{}", caret between, semicolon appended.
			{ doc: "class A ", from: 8, insert: "{}", expect: "class A {};" },
			// A typed "}" replacing the waiting brace: from < to, the document keeps its length.
			{
				doc: "struct P {\n    int v;\n}\n",
				from: 22,
				to: 23,
				insert: "}",
				expect: "struct P {\n    int v;\n};\n",
			},
			// A multi-character input event: the appended text is not "}", so no plan edit runs.
			{
				doc: "class A {\n    int x;\n",
				from: 21,
				insert: "}\n}",
				expect: "class A {\n    int x;\n}\n}",
			},
		];
		for (const row of rows) {
			const typed = stateFor(row.doc, row.from).update({
				changes: { from: row.from, to: row.to ?? row.from, insert: row.insert },
				selection: { anchor: row.from + row.insert.length },
				userEvent: "input.type",
			}).state;
			expect(typed.doc.toString()).toBe(row.expect);
			expect(typed.selection.main.head).toBeLessThanOrEqual(typed.doc.length);
		}
	});

	test("a stale search match is dropped instead of throwing on the next keystroke", () => {
		// This is the shape that produced the screenshot's message: `step()` re-dispatches
		// `matchesRef.current`, the React copy, which keeps the positions an earlier document had.
		// The field now refuses a match past the live document, so the stale list degrades to nothing
		// and the next keystroke is an ordinary edit.
		const longer = "class A {\n".padEnd(62, "a");
		const state = EditorState.create({ doc: longer, extensions: [searchField] });
		const matched = state.update({
			effects: setSearchMatches.of({ matches: [{ from: 61, to: 62 }], active: 0 }),
		}).state;
		// A ten-character deletion leaves the field's own copy mapped to {51, 52}.
		const shorter = matched.update({ changes: { from: 5, to: 15, insert: "" } }).state;
		expect(shorter.doc.length).toBe(52);
		const stale = shorter.update({
			effects: setSearchMatches.of({ matches: [{ from: 61, to: 62 }], active: 0 }),
		}).state;
		expect(() => stale.update({ changes: { from: 0, insert: "x" } }).state).not.toThrow();
		expect(stale.update({ changes: { from: 0, insert: "x" } }).state.doc.length).toBe(53);
	});
});
