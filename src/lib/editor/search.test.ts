import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { collectMatches, searchField, setSearchMatches } from "@/lib/editor/search";

/**
 * The search field stores the list `recompute` or `step` measured, and the next doc change maps it.
 *
 * A list published after the document shrank describes a longer document: `mapPos` cannot map a
 * position past the changeset, which is the reported `Position N is out of range for changeset of
 * length M`. The field must drop such a list at publish time, and a stored one must degrade to
 * "cleared" rather than reach the next transaction.
 */

function state(doc: string): EditorState {
	return EditorState.create({ doc, extensions: [searchField] });
}

describe("searchField with a match list from a longer document", () => {
	test("a list published past the document's end is cleared, and the next keystroke is safe", () => {
		let current = state("x".repeat(62));
		current = current.update({
			effects: setSearchMatches.of({ matches: [{ from: 61, to: 62 }], active: 0 }),
		}).state;
		expect(current.field(searchField).matches).toEqual([{ from: 61, to: 62 }]);

		// Delete ten characters: the field maps its own copy, which is still valid.
		current = current.update({ changes: { from: 52, to: 62 } }).state;
		expect(current.doc.length).toBe(52);
		for (const match of current.field(searchField).matches) {
			expect(match.to).toBeLessThanOrEqual(current.doc.length);
		}

		// The publisher republishes the longer document's list, which is what `step` used to do.
		current = current.update({
			effects: setSearchMatches.of({ matches: [{ from: 61, to: 62 }], active: 0 }),
		}).state;
		expect(current.field(searchField).matches).toEqual([]);

		expect(() =>
			current.update({ changes: { from: 52, insert: "q" }, userEvent: "input.type" }),
		).not.toThrow();
	});

	test("a stored list beyond the old document is dropped when the document changes", () => {
		let current = state("x".repeat(62));
		current = current.update({
			effects: setSearchMatches.of({
				matches: [
					{ from: 10, to: 14 },
					{ from: 61, to: 62 },
				],
				active: 1,
			}),
		}).state;
		// A change that shrinks the document, with no fresh publish: the second match can only be
		// mapped if the change is allowed to name a position the old document never had.
		const next = current.update({ changes: { from: 20, to: 62 } });
		expect(next.state.doc.length).toBe(20);
		expect(next.state.field(searchField).matches).toEqual([{ from: 10, to: 14 }]);
	});
});

describe("collectMatches", () => {
	test("measures the document it is given", () => {
		expect(
			collectMatches("a line\nline\n", "line", { caseSensitive: true, regex: false }),
		).toEqual([
			{ from: 2, to: 6 },
			{ from: 7, to: 11 },
		]);
		expect(collectMatches("abc", "line", { caseSensitive: true, regex: false })).toEqual([]);
	});

	test("an invalid pattern answers null rather than throwing", () => {
		expect(collectMatches("abc", "(", { caseSensitive: true, regex: true })).toBeNull();
	});
});
