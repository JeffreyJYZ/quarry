import "@/test/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { Diagnostic } from "@/lib/project/api";
import type { ProblemFile } from "@/lib/problems/model";
import { useProblemItems } from "@/lib/problems/useProblemItems";

function diag(message: string): Diagnostic {
	return {
		path: "x",
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
		severity: 1,
		message,
		source: null,
	};
}

const files: ProblemFile[] = [
	{ path: "/p/a.cpp", name: "a.cpp", diagnostics: [diag("boom"), diag("bang")] },
	{ path: "/p/b.cpp", name: "b.cpp", diagnostics: [diag("warn")] },
];

afterEach(() => {
	cleanup();
});

describe("useProblemItems", () => {
	test("keeps one row list across a re-render that changed nothing", () => {
		const { result, rerender } = renderHook(
			({ list }: { list: ProblemFile[] }) => useProblemItems(list),
			{ initialProps: { list: files } },
		);
		const first = result.current;

		rerender({ list: files });

		expect(result.current).toBe(first);
		expect(result.current).toHaveLength(3);
	});

	test("a new file list gives a new row list", () => {
		const { result, rerender } = renderHook(
			({ list }: { list: ProblemFile[] }) => useProblemItems(list),
			{ initialProps: { list: files } },
		);
		const first = result.current;

		rerender({ list: [files[0]] });

		expect(result.current).not.toBe(first);
		expect(result.current).toHaveLength(2);
	});
});
