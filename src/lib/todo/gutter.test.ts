import { describe, expect, mock, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import {
	openTodoAt,
	setTodoComments,
	todoCommentField,
	todoGutter,
	todoMarkerRanges,
} from "@/lib/todo/gutter";
import { todoLines } from "@/lib/todo/lines";
import type { TodoComment } from "@/lib/todo/lines";

const DOC = ["alpha", "// TODO: bravo", "charlie", "// FIXME: delta"].join("\n");

function stateWith(text: string): EditorState {
	return EditorState.create({ doc: text, extensions: todoGutter(() => undefined) }).update({
		effects: setTodoComments.of(todoLines(text)),
	}).state;
}

function markedLines(state: EditorState): number[] {
	return todoMarkerRanges(state).map((range) => state.doc.lineAt(range.from).number);
}

describe("the TODO gutter", () => {
	test("marks exactly the lines carrying a marker", () => {
		expect(markedLines(stateWith(DOC))).toEqual([2, 4]);
	});

	test("a line the document no longer has is not marked", () => {
		const state = EditorState.create({
			doc: "alpha",
			extensions: todoGutter(() => undefined),
		}).update({ effects: setTodoComments.of(todoLines(DOC)) }).state;
		expect(markedLines(state)).toEqual([]);
	});

	test("an empty set paints nothing", () => {
		const state = EditorState.create({ doc: DOC, extensions: todoGutter(() => undefined) });
		expect(markedLines(state)).toEqual([]);
		expect(state.field(todoCommentField)).toEqual([]);
	});

	test("recomputing after an edit follows the buffer", () => {
		const before = stateWith(DOC);
		const edited = "// HACK: only marker now";
		const after = before.update({
			changes: { from: 0, to: before.doc.length, insert: edited },
			effects: setTodoComments.of(todoLines(edited)),
		}).state;
		expect(markedLines(after)).toEqual([1]);
	});
});

describe("a click on a marker", () => {
	test("reports the marker on the clicked line", () => {
		const state = stateWith(DOC);
		const open = mock((_marker: TodoComment) => undefined);
		const clicked = openTodoAt(state, state.doc.line(2).from, open);
		expect(clicked).toBe(true);
		expect(open).toHaveBeenCalledTimes(1);
		expect(open.mock.calls[0]?.[0]).toEqual({ line: 2, kind: "TODO", text: "bravo" });
	});

	test("does nothing on a line with no marker", () => {
		const state = stateWith(DOC);
		const open = mock((_marker: TodoComment) => undefined);
		expect(openTodoAt(state, state.doc.line(1).from, open)).toBe(false);
		expect(open).toHaveBeenCalledTimes(0);
	});
});
