import { describe, expect, test } from "bun:test";
import { nextTabPath } from "@/lib/editor/tabs";

const buffers = [{ path: "/a" }, { path: "/b" }, { path: "/c" }];

describe("nextTabPath", () => {
	test("moves to the next tab and wraps at the end", () => {
		expect(nextTabPath(buffers, "/a", 1)).toBe("/b");
		expect(nextTabPath(buffers, "/c", 1)).toBe("/a");
	});

	test("moves back and wraps at the start", () => {
		expect(nextTabPath(buffers, "/b", -1)).toBe("/a");
		expect(nextTabPath(buffers, "/a", -1)).toBe("/c");
	});

	test("a step larger than the list still lands inside it", () => {
		expect(nextTabPath(buffers, "/a", 5)).toBe("/c");
		expect(nextTabPath(buffers, "/a", -5)).toBe("/b");
	});

	test("starts at the first tab when nothing is active", () => {
		expect(nextTabPath(buffers, null, 1)).toBe("/a");
	});

	test("answers null when nothing is open", () => {
		expect(nextTabPath([], "/a", 1)).toBeNull();
	});
});
