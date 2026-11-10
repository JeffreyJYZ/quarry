import { describe, expect, test } from "bun:test";
import type { BreakpointRow } from "@/lib/debug/breakpointTypes";
import type { StopView } from "@/lib/debug/sessionTypes";
import { isCurrentBreakpoint, stopLabel, stopLocation } from "@/lib/debug/stopLocation";

function view(path: string | null, line: number): StopView {
	return {
		reason: "breakpoint",
		description: null,
		threadId: 1,
		frames: [{ id: 1, name: "main", source: path, line, column: 1, instructionPointer: null }],
		frameId: 1,
		scopes: [],
	};
}

function row(path: string, line: number): BreakpointRow {
	return {
		key: `${path}:${line}`,
		path,
		line,
		verified: true,
		message: null,
		condition: null,
		hitCondition: null,
		logMessage: null,
		enabled: true,
		temporary: false,
	};
}

describe("the stop's location", () => {
	test("is the top frame's file and line while stopped", () => {
		expect(stopLocation("stopped", view("/a.rs", 12))).toEqual({ path: "/a.rs", line: 12 });
	});

	test("is null while running, launching or idle", () => {
		expect(stopLocation("running", view("/a.rs", 12))).toBeNull();
		expect(stopLocation("launching", view("/a.rs", 12))).toBeNull();
		expect(stopLocation("idle", null)).toBeNull();
	});

	test("is null when a stop carried no stack frame", () => {
		expect(stopLocation("stopped", null)).toBeNull();
	});

	test("names the stop in the header", () => {
		expect(stopLabel({ path: "/work/main.rs", line: 7 })).toBe("stopped at main.rs:7");
		expect(stopLabel(null)).toBeNull();
	});

	test("names a frame the adapter gave no file for by its line alone", () => {
		expect(stopLabel({ path: null, line: 4 })).toBe("stopped at line 4");
	});
});

describe("the breakpoint row the debuggee is stopped on", () => {
	const rows = [row("/a.rs", 10), row("/a.rs", 11), row("/b.rs", 10)];

	test("marks exactly one row on path and line", () => {
		const location = { path: "/a.rs", line: 10 };
		expect(rows.filter((entry) => isCurrentBreakpoint(entry, location))).toHaveLength(1);
		expect(isCurrentBreakpoint(rows[0] as BreakpointRow, location)).toBe(true);
	});

	test("adjacent lines do not collide", () => {
		const location = { path: "/a.rs", line: 11 };
		expect(isCurrentBreakpoint(row("/a.rs", 10), location)).toBe(false);
		expect(isCurrentBreakpoint(row("/a.rs", 11), location)).toBe(true);
		expect(isCurrentBreakpoint(row("/a.rs", 12), location)).toBe(false);
	});

	test("marks nothing when the stop is on no breakpoint", () => {
		const location = { path: "/a.rs", line: 40 };
		expect(rows.filter((entry) => isCurrentBreakpoint(entry, location))).toHaveLength(0);
	});

	test("marks nothing when the stop is in another file", () => {
		const location = { path: "/b.rs", line: 10 };
		expect(isCurrentBreakpoint(row("/a.rs", 10), location)).toBe(false);
		expect(isCurrentBreakpoint(row("/b.rs", 10), location)).toBe(true);
	});

	test("marks nothing after the session continues", () => {
		expect(isCurrentBreakpoint(row("/a.rs", 10), null)).toBe(false);
	});
});
