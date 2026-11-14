import { describe, expect, test } from "bun:test";
import "@/test/dom";
import { createView } from "@/lib/editor/dispatchFuzz";
import { searchField, setSearchMatches } from "@/lib/editor/search";
import { replacementChanges } from "@/lib/search/replace";

const host = document.createElement("div");
document.body.appendChild(host);

const OPTIONS = { caseSensitive: false, regex: false, wholeWord: false };

/**
 * The in-file search sheet keeps its match list in a ref that is refreshed on a `setTimeout(…, 0)`
 * after a document change (`extensionsBehaviour.ts`), so `step()` and `replaceOne()` can act on a
 * list measured on an older, longer document. `searchField.update` then maps those positions
 * through the new document's changeset.
 *
 * These two tests pin the invariant that must hold: a published match list is absolute positions in
 * the live document. Both are `test.failing` because the product does not clip them yet; the day the
 * fix lands they report a failure, which is the signal to delete them.
 */
describe("search matches measured on an older document", () => {
	test.failing("mapPos through the next keystroke must not throw (61 into 52)", () => {
		let prefix = "class Widget {\n    int width;\n    int height;\n    void f();\n";
		while (prefix.length < 61) prefix += " ";
		const doc = `${prefix}draw`;
		expect(doc.length).toBe(65);
		const stale = replacementChanges(doc, "draw", "paint", OPTIONS);
		expect(stale.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 61, to: 65 }]);

		const view = createView(host, doc, []);
		// The document shrinks to 52 while the sheet still holds the 61..65 match.
		view.dispatch({ changes: { from: 52, to: 65 }, userEvent: "delete.backward" });
		expect(view.state.doc.length).toBe(52);
		view.dispatch({ effects: setSearchMatches.of({ matches: stale, active: 0 }) });
		expect(view.state.field(searchField).matches.length).toBe(1);

		expect(() =>
			view.dispatch({
				changes: { from: 52, insert: "x" },
				selection: { anchor: 53 },
				userEvent: "input.type",
			}),
		).not.toThrow("Position 61 is out of range for changeset of length 52");
		view.destroy();
	});

	test.failing("replace-one on a stale match must not throw (55 into 50)", () => {
		const doc = "class Widget {\n    int width;\n    int height;\n    void draw();\n};";
		const stale = replacementChanges(doc, "draw", "paint", OPTIONS);
		expect(stale.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 55, to: 59 }]);

		const view = createView(host, doc, []);
		view.dispatch({ changes: { from: 50, to: doc.length }, userEvent: "delete.backward" });
		expect(view.state.doc.length).toBe(50);

		expect(() => view.dispatch({ changes: { from: 55, to: 59, insert: "paint" } })).not.toThrow(
			"Invalid change range 55 to 59 (in doc of length 50)",
		);
		view.destroy();
	});
});
