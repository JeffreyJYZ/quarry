import "@/test/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { useOutlineRows } from "@/lib/outline/useOutlineRows";

function sym(name: string, depth: number, startLine: number, endLine: number): LspSymbol {
	return {
		name,
		kind: 12,
		range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 1 } },
		depth,
	};
}

afterEach(() => {
	cleanup();
});

describe("useOutlineRows", () => {
	const symbols = [sym("outer", 0, 0, 10), sym("inner", 1, 2, 3)];

	test("keeps the row set across a re-render that changed nothing", () => {
		const { result, rerender } = renderHook(
			({ list, filter }: { list: LspSymbol[]; filter: string }) =>
				useOutlineRows(list, filter, 400),
			{ initialProps: { list: symbols, filter: "" } },
		);
		const first = result.current.visibleIndices;
		const firstShown = result.current.shownSymbols;

		rerender({ list: symbols, filter: "" });

		expect(result.current.visibleIndices).toBe(first);
		expect(result.current.shownSymbols).toBe(firstShown);
	});

	test("a new symbol list gives a new row set", () => {
		const { result, rerender } = renderHook(
			({ list, filter }: { list: LspSymbol[]; filter: string }) =>
				useOutlineRows(list, filter, 400),
			{ initialProps: { list: symbols, filter: "" } },
		);
		const first = result.current.visibleIndices;

		rerender({ list: [...symbols], filter: "" });

		expect(result.current.visibleIndices).not.toBe(first);
	});

	test("the filter is part of the memo, and still narrows the rows", () => {
		const { result, rerender } = renderHook(
			({ list, filter }: { list: LspSymbol[]; filter: string }) =>
				useOutlineRows(list, filter, 400),
			{ initialProps: { list: symbols, filter: "" } },
		);
		const first = result.current.visibleIndices;

		rerender({ list: symbols, filter: "inner" });

		expect(result.current.visibleIndices).not.toBe(first);
		expect(result.current.shownSymbols.map((symbol) => symbol.name)).toEqual([
			"outer",
			"inner",
		]);
	});
});
