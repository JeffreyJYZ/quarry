import { describe, expect, test } from "bun:test";
import {
	type CachedDocument,
	DOCUMENT_CACHE_LIMIT,
	type DocumentCache,
	dropDocument,
	dropPathDocuments,
	restoreDocument,
	saveDocument,
} from "@/lib/editor/documentCache";

function cached(path: string, doc: string, scrollTop = 0): CachedDocument {
	return {
		path,
		doc,
		state: { doc, selection: { ranges: [{ anchor: 0 }] } },
		scrollTop,
		scrollLeft: 0,
	};
}

function empty(): DocumentCache {
	return new Map();
}

describe("restoreDocument", () => {
	test("a document that was never saved is a miss", () => {
		expect(restoreDocument(empty(), "/p/a.rs#0", "one")).toBeNull();
	});

	test("a saved document comes back whole: state and scroll", () => {
		const cache = empty();
		saveDocument(cache, "/p/a.rs#0", cached("/p/a.rs", "one", 120));
		const restored = restoreDocument(cache, "/p/a.rs#0", "one");
		expect(restored).not.toBeNull();
		expect(restored?.state).toEqual({ doc: "one", selection: { ranges: [{ anchor: 0 }] } });
		expect(restored?.scrollTop).toBe(120);
	});

	test("a state saved for other text is dropped, not replayed", () => {
		const cache = empty();
		saveDocument(cache, "/p/a.rs#0", cached("/p/a.rs", "before"));
		expect(restoreDocument(cache, "/p/a.rs#0", "after")).toBeNull();
		expect(restoreDocument(cache, "/p/a.rs#0", "before")).toBeNull();
	});
});

describe("a reload", () => {
	test("a bumped load id misses the state the old document left", () => {
		const cache = empty();
		saveDocument(cache, "/p/a.rs#0", cached("/p/a.rs", "one"));
		expect(restoreDocument(cache, "/p/a.rs#1", "one")).toBeNull();
	});

	test("saving the new document drops the old id, which can never be looked up again", () => {
		const cache = empty();
		saveDocument(cache, "/p/a.rs#0", cached("/p/a.rs", "one"));
		saveDocument(cache, "/p/a.rs#1", cached("/p/a.rs", "one"));
		expect(cache.size).toBe(1);
		expect(restoreDocument(cache, "/p/a.rs#0", "one")).toBeNull();
		expect(restoreDocument(cache, "/p/a.rs#1", "one")).not.toBeNull();
	});
});

describe("the cap", () => {
	test("past the limit the least recently used document is evicted", () => {
		const cache = empty();
		saveDocument(cache, "a#0", cached("a", "a"), 2);
		saveDocument(cache, "b#0", cached("b", "b"), 2);
		saveDocument(cache, "c#0", cached("c", "c"), 2);
		expect(cache.size).toBe(2);
		expect(restoreDocument(cache, "a#0", "a")).toBeNull();
		expect(restoreDocument(cache, "c#0", "c")).not.toBeNull();
	});

	test("a restore counts as a use, so the only idle document is the one evicted", () => {
		const cache = empty();
		saveDocument(cache, "a#0", cached("a", "a"), 2);
		saveDocument(cache, "b#0", cached("b", "b"), 2);
		expect(restoreDocument(cache, "a#0", "a")).not.toBeNull();
		saveDocument(cache, "c#0", cached("c", "c"), 2);
		expect(cache.size).toBe(2);
		expect(restoreDocument(cache, "a#0", "a")).not.toBeNull();
		expect(restoreDocument(cache, "b#0", "b")).toBeNull();
	});
});

describe("dropping", () => {
	test("one document can be forgotten by id", () => {
		const cache = empty();
		saveDocument(cache, "a#0", cached("a", "a"));
		dropDocument(cache, "a#0");
		expect(cache.size).toBe(0);
	});

	test("every load of a path can be forgotten at once", () => {
		const cache = empty();
		saveDocument(cache, "a#0", cached("a", "a"));
		saveDocument(cache, "b#0", cached("b", "b"));
		dropPathDocuments(cache, "a");
		expect(cache.size).toBe(1);
		expect(restoreDocument(cache, "b#0", "b")).not.toBeNull();
	});
});

describe("the default limit", () => {
	test("keeps a realistic working set without unbounded growth", () => {
		const cache = empty();
		for (let index = 0; index < DOCUMENT_CACHE_LIMIT + 5; index += 1) {
			saveDocument(cache, `f${index}#0`, cached(`f${index}`, "x"));
		}
		expect(cache.size).toBe(DOCUMENT_CACHE_LIMIT);
	});
});
