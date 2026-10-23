import { describe, expect, test } from "bun:test";
import { isDirty, markSaved } from "@/lib/project/buffer";

describe("isDirty", () => {
	test("false when text equals loaded", () => {
		expect(isDirty({ path: "a", name: "a", text: "x", loaded: "x" })).toBe(false);
	});

	test("true when text differs from loaded", () => {
		expect(isDirty({ path: "a", name: "a", text: "y", loaded: "x" })).toBe(true);
	});
});

describe("markSaved", () => {
	test("text and loaded both become the saved text", () => {
		const b = markSaved({ path: "a", name: "a", text: "old", loaded: "old" }, "new");
		expect(b.text).toBe("new");
		expect(b.loaded).toBe("new");
		expect(isDirty(b)).toBe(false);
	});

	test("preserves path and name", () => {
		const b = markSaved({ path: "p", name: "n", text: "t", loaded: "l" }, "s");
		expect(b.path).toBe("p");
		expect(b.name).toBe("n");
	});
});
