import { describe, expect, test } from "bun:test";
import {
	combineDiagnostics,
	codeActionDiagnostics,
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

describe("codeActionDiagnostics", () => {
	test("only the findings whose range holds the caret are sent, and the path is dropped", () => {
		const here = finding("/p/src/main.cpp", "clangd", "no member named 'x'");
		const elsewhere: Diagnostic = {
			...finding("/p/src/main.cpp", "clangd", "missing ';'"),
			range: { start: { line: 9, character: 0 }, end: { line: 9, character: 1 } },
		};
		const sent = codeActionDiagnostics([here, elsewhere], 3, 5);
		expect(sent).toEqual([
			{
				range: here.range,
				severity: here.severity,
				message: here.message,
				source: here.source,
			},
		]);
		expect("path" in (sent[0] ?? {})).toBe(false);
	});

	test("a caret on the range's end or start still picks the finding up", () => {
		const here = finding("/p/src/main.rs", "rust-analyzer", "mismatched types");
		expect(codeActionDiagnostics([here], 3, 4)).toHaveLength(1);
		expect(codeActionDiagnostics([here], 3, 9)).toHaveLength(1);
		expect(codeActionDiagnostics([here], 3, 2)).toHaveLength(0);
	});

	test("no diagnostics is an empty list, which keeps a source-only request working", () => {
		expect(codeActionDiagnostics([], 0, 0)).toEqual([]);
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
