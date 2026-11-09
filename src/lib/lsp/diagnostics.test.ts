import { describe, expect, test } from "bun:test";
import {
	combineDiagnostics,
	countSeverities,
	type DiagnosticMap,
	diagnosticKey,
	withServerDiagnostics,
} from "@/lib/lsp/diagnostics";
import type { Diagnostic } from "@/lib/project/api";

function finding(path: string, source: string | null, message: string): Diagnostic {
	return {
		path,
		range: { start: { line: 3, character: 4 }, end: { line: 3, character: 9 } },
		severity: 1,
		message,
		source,
	};
}

describe("diagnosticKey", () => {
	test("two sources naming the same span are one problem", () => {
		const fromServer = finding("/p/src/main.cpp", "clangd", "no member named 'x'");
		const fromBuild = finding("/p/src/main.cpp", "clang", "no member named 'x'");
		expect(diagnosticKey(fromServer)).toBe(diagnosticKey(fromBuild));
	});

	test("a different message, span or severity is a different problem", () => {
		const base = finding("/p/src/main.cpp", "clangd", "a");
		expect(diagnosticKey({ ...base, message: "b" })).not.toBe(diagnosticKey(base));
		expect(diagnosticKey({ ...base, severity: 2 })).not.toBe(diagnosticKey(base));
		expect(
			diagnosticKey({
				...base,
				range: { start: { line: 4, character: 4 }, end: { line: 4, character: 9 } },
			}),
		).not.toBe(diagnosticKey(base));
	});
});

describe("combineDiagnostics", () => {
	test("the same problem from both sources draws one row, and it is the server's copy", () => {
		const server: DiagnosticMap = new Map([
			["/p/src/main.cpp", [finding("/p/src/main.cpp", "clangd", "no member named 'x'")]],
		]);
		const build: DiagnosticMap = new Map([
			["/p/src/main.cpp", [finding("/p/src/main.cpp", "clang", "no member named 'x'")]],
		]);
		const combined = combineDiagnostics(server, build);
		const rows = combined.get("/p/src/main.cpp") ?? [];
		expect(rows).toHaveLength(1);
		expect(rows[0]?.source).toBe("clangd");
		expect(countSeverities(combined)).toEqual({ errors: 1, warnings: 0 });
	});

	test("a build finding the server does not report is kept, not hidden", () => {
		const server: DiagnosticMap = new Map([
			["/p/src/main.cpp", [finding("/p/src/main.cpp", "clangd", "no member named 'x'")]],
		]);
		const build: DiagnosticMap = new Map([
			["/p/src/main.cpp", [finding("/p/src/main.cpp", "clang", "linker: undefined symbol")]],
		]);
		const rows = combineDiagnostics(server, build).get("/p/src/main.cpp") ?? [];
		expect(rows.map((row) => row.message)).toEqual([
			"linker: undefined symbol",
			"no member named 'x'",
		]);
	});
});

describe("withServerDiagnostics", () => {
	test("an empty publish drops the file, which is how a fixed file clears", () => {
		const current: DiagnosticMap = new Map([
			["/p/src/main.rs", [finding("/p/src/main.rs", "rust-analyzer", "mismatched types")]],
		]);
		const next = withServerDiagnostics(current, "/p/src/main.rs", []);
		expect(next.has("/p/src/main.rs")).toBe(false);
	});
});
