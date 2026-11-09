import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "@/lib/project/api";
import type { ProblemFile } from "@/lib/problems/model";
import {
	copyLine,
	countProblems,
	type FlatProblem,
	filterProblemFiles,
	flatProblemKey,
	flatProblems,
} from "@/lib/problems/model";

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

describe("countProblems", () => {
	// The regression: the panel's header showed the project-wide totals while the list under it was
	// filtered, so a search for one word still claimed "12 errors" above two rows.
	function row(severity: number): FlatProblem {
		return {
			path: "/p/a.cpp",
			name: "a.cpp",
			diagnostic: { severity, message: "m", range: { start: { line: 0, character: 0 } } },
		} as FlatProblem;
	}

	test("counts only the rows it is given", () => {
		expect(countProblems([row(1), row(2), row(3)])).toEqual({
			errors: 1,
			warnings: 1,
			other: 1,
		});
	});

	test("an empty list counts nothing", () => {
		expect(countProblems([])).toEqual({ errors: 0, warnings: 0, other: 0 });
	});

	test("the list the panel filters is the list it counts", () => {
		const files: ProblemFile[] = [
			{
				path: "/p/a.cpp",
				name: "a.cpp",
				diagnostics: [
					{ severity: 1, message: "needle", range: { start: { line: 0, character: 0 } } },
					{ severity: 2, message: "hay", range: { start: { line: 1, character: 0 } } },
				],
			},
		] as ProblemFile[];
		const filtered = flatProblems(files, new Set([1, 2, 3, 4]), "needle");
		expect(countProblems(filtered)).toEqual({ errors: 1, warnings: 0, other: 0 });
	});
});

describe("flatProblemKey", () => {
	// The regression: the flat panel keyed rows on the diagnostic alone, so two files reporting the
	// same span in the same words collided and React reused one row for both.
	test("two files reporting the same span and text get distinct row keys", () => {
		const shared = diag(1, 4, 2, "boom");
		const left: FlatProblem = { path: "/p/a.cpp", name: "a.cpp", diagnostic: shared };
		const right: FlatProblem = { path: "/p/b.cpp", name: "b.cpp", diagnostic: shared };

		expect(flatProblemKey(left)).not.toBe(flatProblemKey(right));
	});

	test("the same file and problem keep one key", () => {
		const row: FlatProblem = {
			path: "/p/a.cpp",
			name: "a.cpp",
			diagnostic: diag(1, 4, 2, "boom"),
		};
		expect(flatProblemKey({ ...row })).toBe(flatProblemKey(row));
	});
});
