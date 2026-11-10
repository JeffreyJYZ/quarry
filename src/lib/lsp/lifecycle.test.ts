import { describe, expect, test } from "bun:test";
import { countSeverities, type DiagnosticMap } from "@/lib/lsp/diagnostics";
import { applyDiagnosticsEvent } from "@/lib/lsp/lifecycle";
import type { Diagnostic } from "@/lib/project/api";

function finding(path: string, message: string, line = 0): Diagnostic {
	return {
		path,
		range: { start: { line, character: 0 }, end: { line, character: 4 } },
		severity: 1,
		message,
		source: "rust-analyzer",
	};
}

function mapOf(entries: Array<[string, Diagnostic[]]>): DiagnosticMap {
	return new Map(entries);
}

describe("text", () => {
	test("a changed buffer drops its build rows and leaves another file's alone", () => {
		const build = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "no matching function")]],
			["/p/src/lib.rs", [finding("/p/src/lib.rs", "unused import")]],
		]);
		const next = applyDiagnosticsEvent(
			build,
			{ type: "text", path: "/p/src/main.rs" },
			"build",
		);
		expect(next.has("/p/src/main.rs")).toBe(false);
		expect(next.get("/p/src/lib.rs")).toEqual(build.get("/p/src/lib.rs"));
	});

	test("the server's own rows survive typing, because it follows the text live", () => {
		const server = mapOf([["/p/src/main.rs", [finding("/p/src/main.rs", "mismatched types")]]]);
		expect(applyDiagnosticsEvent(server, { type: "text", path: "/p/src/main.rs" })).toBe(
			server,
		);
	});

	test("a file a build never flagged costs no new map", () => {
		const build = mapOf([["/p/src/lib.rs", [finding("/p/src/lib.rs", "unused import")]]]);
		const next = applyDiagnosticsEvent(
			build,
			{ type: "text", path: "/p/src/main.rs" },
			"build",
		);
		expect(next).toBe(build);
	});
});

describe("close", () => {
	test("drops exactly that file's diagnostics and leaves the others", () => {
		const current = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "mismatched types")]],
			["/p/src/lib.rs", [finding("/p/src/lib.rs", "unused import")]],
		]);
		const next = applyDiagnosticsEvent(current, { type: "close", path: "/p/src/main.rs" });
		expect(next.has("/p/src/main.rs")).toBe(false);
		expect(next.get("/p/src/lib.rs")).toEqual(current.get("/p/src/lib.rs"));
	});

	test("a build finding outlives the tab it was shown in", () => {
		const build = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "no matching function")]],
		]);
		const next = applyDiagnosticsEvent(
			build,
			{ type: "close", path: "/p/src/main.rs" },
			"build",
		);
		expect(next).toBe(build);
	});
});

describe("session-end", () => {
	test("drops every diagnostic the server published, and the badge follows", () => {
		const current = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "mismatched types")]],
			[
				"/p/src/lib.rs",
				[finding("/p/src/lib.rs", "unused import"), finding("/p/src/lib.rs", "x", 2)],
			],
			["/p/include/shim.h", [finding("/p/include/shim.h", "unknown type")]],
		]);
		expect(countSeverities(current)).toEqual({ errors: 4, warnings: 0 });

		const next = applyDiagnosticsEvent(current, { type: "session-end", kind: "rust-analyzer" });
		expect([...next.keys()]).toEqual(["/p/include/shim.h"]);
		expect(countSeverities(next)).toEqual({ errors: 1, warnings: 0 });
	});

	test("a build finding survives the server that never published it", () => {
		const build = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "no matching function")]],
		]);
		const next = applyDiagnosticsEvent(build, { type: "session-end", kind: null }, "build");
		expect(next).toBe(build);
	});

	test("an unknown kind drops every server finding", () => {
		const current = mapOf([
			["/p/src/main.rs", [finding("/p/src/main.rs", "a")]],
			["/p/src/main.cpp", [finding("/p/src/main.cpp", "b")]],
		]);
		expect(applyDiagnosticsEvent(current, { type: "session-end", kind: null }).size).toBe(0);
	});
});

describe("rename", () => {
	test("moves the diagnostics to the new path and leaves no old key", () => {
		const current = mapOf([["/p/src/old.rs", [finding("/p/src/old.rs", "mismatched types")]]]);
		const next = applyDiagnosticsEvent(current, {
			type: "rename",
			from: "/p/src/old.rs",
			to: "/p/src/new.rs",
		});
		expect(next.has("/p/src/old.rs")).toBe(false);
		const movedRows = next.get("/p/src/new.rs") ?? [];
		expect(movedRows).toHaveLength(1);
		expect(movedRows[0]?.path).toBe("/p/src/new.rs");
	});

	test("merges with what already arrived under the new path, without duplicates", () => {
		const current = mapOf([
			["/p/src/old.rs", [finding("/p/src/old.rs", "mismatched types")]],
			["/p/src/new.rs", [finding("/p/src/new.rs", "mismatched types")]],
		]);
		const next = applyDiagnosticsEvent(current, {
			type: "rename",
			from: "/p/src/old.rs",
			to: "/p/src/new.rs",
		});
		expect(next.has("/p/src/old.rs")).toBe(false);
		expect(next.get("/p/src/new.rs")).toHaveLength(1);
	});

	test("a rename of a file with no diagnostics changes nothing", () => {
		const current = mapOf([["/p/src/other.rs", [finding("/p/src/other.rs", "a")]]]);
		const next = applyDiagnosticsEvent(current, {
			type: "rename",
			from: "/p/src/old.rs",
			to: "/p/src/new.rs",
		});
		expect(next).toBe(current);
	});
});
