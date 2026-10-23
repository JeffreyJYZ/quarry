import { describe, expect, test } from "bun:test";
import { removeRecentRoot } from "@/lib/projects/recent";

describe("removeRecentRoot", () => {
	test("drops the matching entry and keeps order", () => {
		const roots = ["/a", "/b", "/c"];
		expect(removeRecentRoot(roots, "/b")).toEqual(["/a", "/c"]);
	});

	test("returns a copy when the target is absent", () => {
		const roots = ["/a", "/b"];
		const result = removeRecentRoot(roots, "/z");
		expect(result).toEqual(["/a", "/b"]);
		expect(result).not.toBe(roots);
	});

	test("empty list stays empty", () => {
		expect(removeRecentRoot([], "/a")).toEqual([]);
	});
});
