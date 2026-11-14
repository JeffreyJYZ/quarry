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
 * list measured on an older, longer document. `searchField.update` maps those positions through the
 * new document's changeset.
 *
 * The invariant pinned here: a published match list is absolute positions in the live document, and a
 * list that is not is refused at the field rather than stored for the next transaction to map. These
 * were `test.failing` while the product clipped nothing; they are ordinary regressions now.
 */
describe("search matches measured on an older document", () => {
	test("a stale publish is refused, so the next keystroke maps nothing (61 into 52)", () => {
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
		expect(view.state.field(searchField).matches.length).toBe(0);

		expect(() =>
			view.dispatch({
				changes: { from: 52, insert: "x" },
				selection: { anchor: 53 },
				userEvent: "input.type",
			}),
		).not.toThrow();
		expect(view.state.doc.length).toBe(53);
		view.destroy();
	});

	test("replace-one has no stale match to act on (55 into 50)", () => {
		const doc = "class Widget {\n    int width;\n    int height;\n    void draw();\n};";
		const stale = replacementChanges(doc, "draw", "paint", OPTIONS);
		expect(stale.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 55, to: 59 }]);

		const view = createView(host, doc, []);
		view.dispatch({ changes: { from: 50, to: doc.length }, userEvent: "delete.backward" });
		expect(view.state.doc.length).toBe(50);
		view.dispatch({ effects: setSearchMatches.of({ matches: stale, active: 0 }) });

		// Nothing survives to replace: the sheet recomputes against the live text instead of
		// dispatching a range measured on the old one.
		expect(view.state.field(searchField).matches.length).toBe(0);
		view.destroy();
	});
});
