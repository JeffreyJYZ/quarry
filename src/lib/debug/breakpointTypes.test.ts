import { describe, expect, test } from "bun:test";
import { type BreakpointEntry, dropTemporary } from "@/lib/debug/breakpointTypes";

function entry(temporary: boolean): BreakpointEntry {
	return {
		condition: null,
		hitCondition: null,
		logMessage: null,
		enabled: true,
		verified: null,
		message: null,
		temporary,
	};
}

describe("dropTemporary", () => {
	test("removes run-to-cursor lines and keeps the rest", () => {
		const map = new Map([
			[
				"/a.rs",
				new Map([
					[3, entry(true)],
					[5, entry(false)],
				]),
			],
			["/b.rs", new Map([[7, entry(true)]])],
		]);
		const { next, paths } = dropTemporary(map);
		expect([...paths].sort()).toEqual(["/a.rs", "/b.rs"]);
		expect([...next.keys()]).toEqual(["/a.rs"]);
		expect([...(next.get("/a.rs")?.keys() ?? [])]).toEqual([5]);
	});

	test("leaves the input map untouched", () => {
		const map = new Map([["/a.rs", new Map([[3, entry(true)]])]]);
		dropTemporary(map);
		expect(map.get("/a.rs")?.size).toBe(1);
	});

	test("reports no paths when every breakpoint is permanent", () => {
		const map = new Map([["/a.rs", new Map([[3, entry(false)]])]]);
		const { next, paths } = dropTemporary(map);
		expect(paths).toEqual([]);
		expect(next).toEqual(map);
	});

	test("a run-to-cursor landing clears its own temporary entry and keeps the rest", () => {
		/* The stop the temporary breakpoint produced: the entry is gone, its permanent neighbour not. */
		const map = new Map([
			[
				"/a.rs",
				new Map([
					[11, entry(false)],
					[12, entry(true)],
				]),
			],
		]);
		const { next, paths } = dropTemporary(map);
		expect(paths).toEqual(["/a.rs"]);
		expect([...(next.get("/a.rs")?.keys() ?? [])]).toEqual([11]);
	});
});
