import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "@/lib/project/api";
import type { ProblemFile } from "@/lib/problems/model";
import { copyLine, filterProblemFiles, flatProblems } from "@/lib/problems/model";

const diag = (
	severity: Diagnostic["severity"],
	line: number,
	char: number,
	message: string,
): Diagnostic => ({
	path: "x",
	range: { start: { line, character: char }, end: { line, character: char } },
	severity,
	message,
	source: null,
});

describe("filterProblemFiles", () => {
	test("drops files with no surviving diagnostics", () => {
		const files: ProblemFile[] = [
			{ path: "a.ts", name: "a.ts", diagnostics: [diag(1, 0, 0, "boom")] },
			{ path: "b.ts", name: "b.ts", diagnostics: [diag(2, 1, 0, "warn")] },
		];
		const out = filterProblemFiles(files, new Set([1]));
		expect(out).toHaveLength(1);
		expect(out[0].path).toBe("a.ts");
	});
});

describe("flatProblems", () => {
	test("sorts by severity then path then line", () => {
		const files: ProblemFile[] = [
			{ path: "b.ts", name: "b.ts", diagnostics: [diag(2, 5, 0, "w")] },
			{ path: "a.ts", name: "a.ts", diagnostics: [diag(1, 2, 0, "e")] },
		];
		const out = flatProblems(files, new Set([1, 2]));
		expect(out.map((r) => r.diagnostic.severity)).toEqual([1, 2]);
	});
});

describe("copyLine", () => {
	test("composes path:line:col severity: message", () => {
		const d = diag(1, 27, 6, "boom");
		expect(copyLine("src/App.tsx", d)).toBe("src/App.tsx:28:7 error: boom");
	});
});
