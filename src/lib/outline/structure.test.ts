import { describe, expect, test } from "bun:test";
import {
	initialActive,
	stepActive,
	structureRows,
	structureSession,
	structureSource,
	structureStatus,
} from "@/lib/outline/structure";
import type { LspStatusMap } from "@/lib/lsp/session";
import type { ServerState } from "@/lib/status/model";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";

function sym(name: string, depth: number, line: number, kind = 12): LspSymbol {
	return {
		name,
		kind,
		range: { start: { line, character: 0 }, end: { line: line + 1, character: 1 } },
		depth,
	};
}

const READY: ServerState = {
	phase: "ready",
	status: { root: "/p", server: "rust-analyzer", version: null },
};
const ABSENT: ServerState = { phase: "absent" };

function states(live: ServerState): LspStatusMap {
	return { "rust-analyzer": live, clangd: ABSENT };
}

describe("structureRows", () => {
	test("an empty query lists every symbol up to the cap", () => {
		const symbols = [sym("alpha", 0, 0), sym("beta", 0, 1), sym("gamma", 0, 2)];
		expect(structureRows(symbols, "")).toEqual([0, 1, 2]);
		expect(structureRows(symbols, "  ", 2)).toEqual([0, 1]);
	});

	test("a substring matches case-insensitively", () => {
		const symbols = [sym("Alpha", 0, 0), sym("Beta", 0, 1)];
		expect(structureRows(symbols, "ALP")).toEqual([0]);
		expect(structureRows(symbols, "et")).toEqual([1]);
	});

	test("a kind word keeps only that kind", () => {
		const symbols = [sym("run", 0, 0, 6), sym("helper", 0, 1, 12)];
		expect(structureRows(symbols, "method")).toEqual([0]);
		expect(structureRows(symbols, "fn")).toEqual([1]);
	});

	test("a child matches on its own name without dragging its parent in", () => {
		const symbols = [sym("impl Widget", 0, 0), sym("render", 1, 2), sym("other", 0, 10)];
		expect(structureRows(symbols, "render")).toEqual([1]);
	});

	test("nothing matching is an empty list, and so is no symbol at all", () => {
		expect(structureRows([sym("foo", 0, 0)], "zzz")).toEqual([]);
		expect(structureRows([], "")).toEqual([]);
		expect(structureRows([], "foo")).toEqual([]);
	});
});

describe("initialActive", () => {
	test("the caret's symbol wins over the first row", () => {
		expect(initialActive([0, 1, 2], 2)).toBe(2);
	});

	test("no caret symbol, or a filtered-out one, falls back to the first row", () => {
		expect(initialActive([0, 1, 2], -1)).toBe(0);
		expect(initialActive([0, 2], 1)).toBe(0);
		expect(initialActive([], 0)).toBe(0);
	});
});

describe("stepActive", () => {
	test("wraps at both ends", () => {
		expect(stepActive(0, 3, 1)).toBe(1);
		expect(stepActive(2, 3, 1)).toBe(0);
		expect(stepActive(0, 3, -1)).toBe(2);
	});

	test("an empty list stays at zero", () => {
		expect(stepActive(0, 0, 1)).toBe(0);
		expect(stepActive(5, 0, -1)).toBe(0);
	});
});

describe("structureSource", () => {
	test("no file, then no session, then ready", () => {
		expect(structureSource(null, null)).toBe("no-file");
		expect(structureSource("/p/src/lib.rs", null)).toBe("no-server");
		expect(structureSource("/p/src/lib.rs", "rust-analyzer::/p")).toBe("ready");
	});
});

describe("structureSession", () => {
	test("needs a root, a file and a ready server", () => {
		expect(structureSession(null, "/p/src/lib.rs", states(READY))).toBeNull();
		expect(structureSession("/p", null, states(READY))).toBeNull();
		expect(structureSession("/p", "/p/src/lib.rs", states(ABSENT))).toBeNull();
		expect(structureSession("/p", "/p/src/lib.rs", states(READY))).toBe("rust-analyzer::/p");
	});

	test("a file the ready server does not serve has no session", () => {
		expect(structureSession("/p", "/p/notes.txt", states(READY))).toBeNull();
	});
});

describe("structureStatus", () => {
	const ready = { source: "ready" as const, loading: false, error: null };

	test("names the cause instead of drawing an empty box", () => {
		expect(
			structureStatus({ ...ready, source: "no-file", symbolCount: 0, rowCount: 0 }),
		).toEqual({
			text: "No file open.",
			tone: "info",
		});
		expect(
			structureStatus({ ...ready, source: "no-server", symbolCount: 0, rowCount: 0 }),
		).toEqual({ text: "No language server for this file.", tone: "info" });
		expect(structureStatus({ ...ready, symbolCount: 0, rowCount: 0 })).toEqual({
			text: "The language server returned no symbols for this file.",
			tone: "info",
		});
	});

	test("loading, an error and a filter with no match each say their own thing", () => {
		expect(
			structureStatus({ ...ready, loading: true, symbolCount: 0, rowCount: 0 })?.text,
		).toBe("loading symbols…");
		expect(
			structureStatus({ ...ready, error: "server gone", symbolCount: 0, rowCount: 0 }),
		).toEqual({ text: "server gone", tone: "error" });
		expect(structureStatus({ ...ready, symbolCount: 1, rowCount: 0 })?.text).toBe(
			"No symbol matches.",
		);
	});

	test("a list with rows has nothing to say", () => {
		expect(structureStatus({ ...ready, symbolCount: 3, rowCount: 3 })).toBeNull();
	});
});
