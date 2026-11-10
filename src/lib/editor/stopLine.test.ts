import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import {
	setStopLine,
	stopDecorationLines,
	stopLineGutter,
	stopLineOf,
	stopMarkerRanges,
} from "@/lib/editor/stopLine";

const DOC = "alpha\nbravo\ncharlie\ndelta";

function stateWith(line: number | null): EditorState {
	const initial = EditorState.create({ doc: DOC, extensions: stopLineGutter });
	return initial.update({ effects: setStopLine.of(line) }).state;
}

function markerLines(state: EditorState): number[] {
	return stopMarkerRanges(state).map((range) => state.doc.lineAt(range.from).number);
}

describe("the stopped line's decoration", () => {
	test("paints the arrow and the tint on the frame's line", () => {
		const state = stateWith(3);
		expect(markerLines(state)).toEqual([3]);
		expect(stopDecorationLines(state)).toEqual([3]);
	});

	test("paints nothing while the debuggee runs", () => {
		const state = stateWith(null);
		expect(markerLines(state)).toEqual([]);
		expect(stopDecorationLines(state)).toEqual([]);
	});

	test("a line the document no longer has paints nothing", () => {
		const state = stateWith(99);
		expect(markerLines(state)).toEqual([]);
		expect(stopDecorationLines(state)).toEqual([]);
	});

	test("a later stop moves both marks instead of adding one", () => {
		const moved = stateWith(2).update({ effects: setStopLine.of(4) }).state;
		expect(markerLines(moved)).toEqual([4]);
		expect(stopDecorationLines(moved)).toEqual([4]);
	});
});

describe("the frame's line for one editor", () => {
	const debug = { stopped: true, path: "/a.rs", line: 3 };

	test("is the frame's line in the file it names", () => {
		expect(stopLineOf(debug, "/a.rs")).toBe(3);
	});

	test("is zero in any other file, even on the same line number", () => {
		expect(stopLineOf(debug, "/b.rs")).toBe(0);
		expect(stopLineOf({ ...debug, line: 9 }, "/b.rs")).toBe(0);
	});

	test("is zero while the session is not stopped", () => {
		expect(stopLineOf({ ...debug, stopped: false }, "/a.rs")).toBe(0);
		expect(stopLineOf(undefined, "/a.rs")).toBe(0);
	});

	test("is zero when the editor holds no file", () => {
		expect(stopLineOf(debug, null)).toBe(0);
	});
});
