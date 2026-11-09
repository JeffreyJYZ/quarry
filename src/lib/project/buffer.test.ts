import { describe, expect, test } from "bun:test";
import { documentId, isDirty, markSaved, settleSave } from "@/lib/project/buffer";

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

describe("settleSave", () => {
	test("the written text replaces the text when nothing was typed during the write", () => {
		const live = { path: "a", name: "a", text: "typed", loaded: "old" };
		const b = settleSave(live, "typed", "typed, formatted");
		expect(b.text).toBe("typed, formatted");
		expect(b.loaded).toBe("typed, formatted");
		expect(isDirty(b)).toBe(false);
	});

	test("flowed as a formatter rewrite: the buffer shows what the disk took", () => {
		const live = { path: "a", name: "a", text: "fn  main()  {}", loaded: "fn  main()  {}" };
		const b = settleSave(live, "fn  main()  {}", "fn main() {}\n");
		expect(b.text).toBe("fn main() {}\n");
		expect(isDirty(b)).toBe(false);
	});

	test("text typed while the write was in flight survives and stays dirty", () => {
		const live = { path: "a", name: "a", text: "one two", loaded: "old" };
		const b = settleSave(live, "one", "one");
		expect(b.text).toBe("one two");
		expect(b.loaded).toBe("one");
		expect(isDirty(b)).toBe(true);
	});

	test("a write that lands the text already in memory clears the dot", () => {
		const live = { path: "a", name: "a", text: "same", loaded: "old" };
		const b = settleSave(live, "something else", "same");
		expect(b.text).toBe("same");
		expect(b.loaded).toBe("same");
		expect(isDirty(b)).toBe(false);
	});

	test("keeps the reload counter, so a save is not a new document", () => {
		const live = { path: "a", name: "a", text: "x", loaded: "x", loadId: 3 };
		expect(settleSave(live, "x", "x").loadId).toBe(3);
	});
});

describe("documentId", () => {
	test("two paths are two documents", () => {
		expect(documentId({ path: "/p/a.rs" })).not.toBe(documentId({ path: "/p/b.rs" }));
	});

	test("a reload is a different document, so the editor drops the old history", () => {
		expect(documentId({ path: "/p/a.rs", loadId: 0 })).not.toBe(
			documentId({ path: "/p/a.rs", loadId: 1 }),
		);
	});

	test("an unloaded buffer reads as the first load", () => {
		expect(documentId({ path: "/p/a.rs" })).toBe(documentId({ path: "/p/a.rs", loadId: 0 }));
	});

	test("a save keeps the id, so undo survives saving", () => {
		const saved = markSaved({ path: "/p/a.rs", name: "a.rs", text: "t", loaded: "t" }, "t2");
		expect(documentId(saved)).toBe(documentId({ path: "/p/a.rs" }));
	});
});
