import "@/test/render";
import { describe, expect, test } from "bun:test";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { occurrencesField, setOccurrences } from "@/lib/editor/occurrences";
import { inlayHintsField, setInlayHints } from "@/lib/editor/inlayHints";
import { decorationsFor } from "@/lib/editor/semanticTokens";

/**
 * LSP decorations are computed against the document a server last saw, and applied after a wait.
 *
 * `src/ui/editor/useOccurrenceHighlights.ts:67-79` clamps the line to the live document but adds the
 * server's character offset unclamped, so a highlight that ran to the end of a longer document can
 * end past `doc.length`. This probes what the field does with such a range.
 */

function stateWith(extension: Extension) {
	const state = EditorState.create({ doc: "int x;\n", extensions: [extension] });
	const view = new EditorView({
		state,
		parent: document.createElement("div") as unknown as HTMLElement,
	});
	return { state, view };
}

describe("a stale LSP range applied to a shorter document", () => {
	test("a document highlight past the end does not throw", () => {
		const { state, view } = stateWith(occurrencesField);

		const next = state.update({
			effects: setOccurrences.of([{ from: 4, to: 61, strong: false }]),
		});
		// Reading `.state` is what builds the field, and a decoration outside the document is the
		// point of the probe: it must be dropped rather than crash the view.
		expect(() => next.state.doc.length).not.toThrow();
		expect(() => view.update([next])).not.toThrow();
	});

	test("an inlay hint past the end is clamped by the field itself", () => {
		const { state } = stateWith(inlayHintsField);
		const next = state.update({
			effects: setInlayHints.of([{ line: 99, character: 99, label: "hint", kind: null }]),
		});

		expect(() => next.state.doc.length).not.toThrow();
		expect(next.state.doc.length).toBe(state.doc.length);
	});

	test("a semantic token past the end marks nothing", () => {
		// src/lib/editor/semanticTokens.ts:82-88 drops a token past the document and clamps the end
		// of one that starts inside a line, so a token list from a longer document is harmless.
		const state = EditorState.create({ doc: "int x;\n" });
		const marks = decorationsFor(
			{
				lines: state.doc.lines,
				line: (number) =>
					number >= 1 && number <= state.doc.lines ? state.doc.line(number) : null,
			},
			[
				{ line: 0, start: 4, length: 99, kind: "type", modifiers: [] },
				{ line: 9, start: 0, length: 4, kind: "type", modifiers: [] },
			],
		);

		expect(marks.size).toBe(1);
		const ends: number[] = [];
		marks.between(0, state.doc.length, (_from, to) => {
			ends.push(to);
		});
		expect(ends).toEqual([state.doc.line(1).to]);
	});
});
