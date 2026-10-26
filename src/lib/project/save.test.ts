import { describe, expect, test } from "bun:test";
import { formatJsonText } from "@/lib/project/save";

describe("formatJsonText", () => {
	test("detects tab indent", () => {
		const text = '{\n\t"a": 1\n}\n';
		expect(formatJsonText(text, "x.json")).toBe('{\n\t"a": 1\n}\n');
	});

	test("detects 2-space indent", () => {
		const text = '{\n  "a": 1\n}\n';
		expect(formatJsonText(text, "x.json")).toBe('{\n  "a": 1\n}\n');
	});

	test("detects 4-space indent", () => {
		const text = '{\n    "a": 1\n}\n';
		expect(formatJsonText(text, "x.json")).toBe('{\n    "a": 1\n}\n');
	});

	test("preserves trailing newline when present", () => {
		const text = '{"a":1}\n';
		expect(formatJsonText(text, "x.json").endsWith("\n")).toBe(true);
	});

	test("adds trailing newline when input had one but output lacked", () => {
		// single-line input has no newline in formatted? JSON.stringify of object is multi? Actually {"a":1} -> {\n  "a": 1\n}
		const text = '{"a":1}\n';
		const out = formatJsonText(text, "x.json");
		expect(out.endsWith("\n")).toBe(true);
	});

	test("removes trailing newline when input had none", () => {
		const text = '{"a":1}';
		const out = formatJsonText(text, "x.json");
		expect(out.endsWith("\n")).toBe(false);
	});

	test("invalid JSON throws with file name", () => {
		expect(() => formatJsonText("{bad", "foo.json")).toThrow(
			/cannot format foo\.json: invalid JSON/,
		);
	});

	test("JSONC with comments is not valid JSON (caller leaves untouched)", () => {
		expect(() => formatJsonText('{\n  "a": 1 // c\n}', "x.jsonc")).toThrow();
	});
});
