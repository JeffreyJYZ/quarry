import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import {
	bookmarkGutter,
	bookmarkMarkerRanges,
	highlightedLines,
	setBookmarks,
} from "@/lib/bookmarks/gutter";

const DOC = "alpha\nbravo\ncharlie\ndelta";

function stateWith(lines: number[], caret = 0): EditorState {
	const initial = EditorState.create({
		doc: DOC,
		extensions: bookmarkGutter,
		selection: { anchor: caret },
	});
	return initial.update({ effects: setBookmarks.of({ lines, toggle: () => undefined }) }).state;
}

function markedLines(state: EditorState): number[] {
	return bookmarkMarkerRanges(state).map((range) => state.doc.lineAt(range.from).number);
}

describe("the bookmark gutter", () => {
	test("marks exactly the bookmarked lines", () => {
		expect(markedLines(stateWith([1, 3]))).toEqual([1, 3]);
	});

	test("a line the document no longer has is not marked", () => {
		expect(markedLines(stateWith([2, 99]))).toEqual([2]);
	});

	test("an empty set paints nothing", () => {
		expect(markedLines(stateWith([]))).toEqual([]);
	});
});

describe("the caret's bookmark highlight", () => {
	test("tints the caret's line when it carries a bookmark", () => {
		expect(highlightedLines(stateWith([1, 3]))).toEqual([1]);
	});

	test("tints nothing while the caret sits on a plain line", () => {
		expect(highlightedLines(stateWith([1, 3], 6))).toEqual([]);
	});

	test("moving the caret onto another marked line moves the tint", () => {
		const state = stateWith([1, 3], 6);
		const moved = state.update({ selection: { anchor: 12 } }).state;
		expect(highlightedLines(moved)).toEqual([3]);
	});
});
