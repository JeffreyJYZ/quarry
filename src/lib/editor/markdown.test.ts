import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "@/lib/editor/markdown";

describe("parseMarkdown", () => {
	test("a fenced block keeps its lines and language", () => {
		const blocks = parseMarkdown("```rust\nfn main() {}\n```");
		expect(blocks).toEqual([{ kind: "code", language: "rust", lines: ["fn main() {}"] }]);
	});

	test("headings carry their level", () => {
		expect(parseMarkdown("### Section")).toEqual([
			{ kind: "heading", level: 3, text: "Section" },
		]);
	});

	test("bullet and ordered lists are separate kinds", () => {
		expect(parseMarkdown("- one\n- two")).toEqual([
			{ kind: "list", ordered: false, items: ["one", "two"] },
		]);
		expect(parseMarkdown("1. one\n2. two")).toEqual([
			{ kind: "list", ordered: true, items: ["one", "two"] },
		]);
	});

	test("paragraph lines are joined with their newlines intact", () => {
		expect(parseMarkdown("first\nsecond")).toEqual([
			{ kind: "paragraph", text: "first\nsecond" },
		]);
	});

	test("a typical rust-analyzer hover parses into code, paragraph and list", () => {
		const hover = [
			"```rust",
			"fn add(a: i32, b: i32) -> i32",
			"```",
			"",
			"---",
			"",
			"Adds two numbers.",
			"",
			"- `a` — left",
			"- `b` — right",
		].join("\n");
		const blocks = parseMarkdown(hover);
		expect(blocks[0]).toEqual({
			kind: "code",
			language: "rust",
			lines: ["fn add(a: i32, b: i32) -> i32"],
		});
		expect(blocks.map((block) => block.kind)).toEqual(["code", "rule", "paragraph", "list"]);
	});

	test("blank lines are dropped rather than becoming empty blocks", () => {
		expect(parseMarkdown("\n\n\n")).toEqual([]);
	});

	test("horizontal rules parse as rule blocks", () => {
		expect(parseMarkdown("---")).toEqual([{ kind: "rule" }]);
		expect(parseMarkdown("***")).toEqual([{ kind: "rule" }]);
		expect(parseMarkdown("___")).toEqual([{ kind: "rule" }]);
	});

	test("a rule sits between two paragraphs", () => {
		expect(parseMarkdown("before\n\n---\n\nafter")).toEqual([
			{ kind: "paragraph", text: "before" },
			{ kind: "rule" },
			{ kind: "paragraph", text: "after" },
		]);
	});

	test("a rule inside a fenced code block stays code", () => {
		expect(parseMarkdown("```\n---\n```")).toEqual([
			{ kind: "code", language: "", lines: ["---"] },
		]);
	});

	test("a dash list item is not mistaken for a rule", () => {
		expect(parseMarkdown("- item")).toEqual([
			{ kind: "list", ordered: false, items: ["item"] },
		]);
	});
});
