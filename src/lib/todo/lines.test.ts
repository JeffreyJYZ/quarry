import { describe, expect, test } from "bun:test";
import { TODO_PATTERN } from "@/lib/todo/model";
import { type TodoComment, todoLines, todoTooltip } from "@/lib/todo/lines";

const SAMPLE = [
	"fn main() {",
	"    // TODO: wire the pump",
	"    let total = prices.iter().sum::<u32>();",
	"    /* FIXME: the reader leaks */",
	"    // plain prose",
	'    let name = "TODO not a comment";',
	"}",
].join("\n");

describe("the buffer's marker lines", () => {
	test("finds the marker on each line that carries one", () => {
		expect(todoLines(SAMPLE).map((marker) => marker.line)).toEqual([2, 4]);
	});

	test("reports the kind and the comment, trimmed", () => {
		const [pump, leak] = todoLines(SAMPLE);
		expect(pump).toEqual({ line: 2, kind: "TODO", text: "wire the pump" });
		expect(leak).toEqual({ line: 4, kind: "FIXME", text: "the reader leaks" });
	});

	test("keeps one marker per line when a line carries two", () => {
		const markers = todoLines("// TODO first, FIXME second");
		expect(markers).toHaveLength(1);
		expect(markers[0]?.kind).toBe("TODO");
	});

	test("covers every comment style the shared pattern names", () => {
		const kinds = todoLines(
			[
				"# HACK hash",
				"* XXX block continuation",
				"<!-- TODO markup",
				"-- TODO sql",
				"; TODO lisp",
				"/** TODO doc */",
			].join("\n"),
		);
		expect(kinds.map((marker) => marker.kind)).toEqual([
			"HACK",
			"XXX",
			"TODO",
			"TODO",
			"TODO",
			"TODO",
		]);
	});

	test("finds nothing in a buffer without markers", () => {
		expect(todoLines("fn main() {}\n// nothing to see\n")).toEqual([]);
	});

	test("finds nothing in a file with no text", () => {
		expect(todoLines("")).toEqual([]);
	});

	test("the buffer matcher is the scan's own pattern", () => {
		// Guard against a second copy drifting from the TODO window's: the compiled pattern must
		// accept a marker the window's ripgrep query accepts, and reject prose that is not one.
		const pattern = new RegExp(TODO_PATTERN);
		expect(pattern.test("// TODO: wire the pump")).toBe(true);
		expect(pattern.test('let name = "TODO not a comment";')).toBe(false);
	});
});

describe("the marker's tooltip", () => {
	test("is the kind and the comment", () => {
		expect(todoTooltip({ line: 3, kind: "HACK", text: "around the borrow checker" })).toBe(
			"HACK around the borrow checker",
		);
	});

	test("is the kind alone when the comment is empty", () => {
		expect(todoTooltip({ line: 1, kind: "TODO", text: "" })).toBe("TODO");
	});

	test("drops the separators between kind and comment", () => {
		const [marker] = todoLines("    // TODO:   tidy this   ");
		expect(marker).toBeDefined();
		expect(todoTooltip(marker as TodoComment)).toBe("TODO tidy this");
	});

	test("drops a block comment's closing delimiter", () => {
		const [marker] = todoLines("/* FIXME: stop the leak */");
		expect(todoTooltip(marker as TodoComment)).toBe("FIXME stop the leak");
	});
});
