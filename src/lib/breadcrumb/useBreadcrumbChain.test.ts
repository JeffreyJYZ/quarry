import "@/test/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { useBreadcrumbChain } from "@/lib/breadcrumb/useBreadcrumbChain";

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

describe("useBreadcrumbChain", () => {
	const outer = sym("outer", 0, 0, 10);
	const inner = sym("inner", 1, 2, 3);
	const symbols = [inner, outer];

	test("keeps the ordering across a caret move, and filters it per cursor", () => {
		const { result, rerender } = renderHook(
			({
				list,
				cursor,
			}: {
				list: LspSymbol[];
				cursor: { line: number; character: number };
			}) => useBreadcrumbChain(list, cursor),
			{ initialProps: { list: symbols, cursor: { line: 2, character: 0 } } },
		);
		const ordered = result.current.ordered;
		expect(result.current.chain.map((symbol) => symbol.name)).toEqual(["outer", "inner"]);

		rerender({ list: symbols, cursor: { line: 5, character: 0 } });

		expect(result.current.ordered).toBe(ordered);
		expect(result.current.chain.map((symbol) => symbol.name)).toEqual(["outer"]);
	});

	test("a new symbol list gives a new ordering", () => {
		const { result, rerender } = renderHook(
			({
				list,
				cursor,
			}: {
				list: LspSymbol[];
				cursor: { line: number; character: number };
			}) => useBreadcrumbChain(list, cursor),
			{ initialProps: { list: symbols, cursor: { line: 2, character: 0 } } },
		);
		const ordered = result.current.ordered;

		rerender({ list: [outer], cursor: { line: 2, character: 0 } });

		expect(result.current.ordered).not.toBe(ordered);
	});

	test("no cursor gives an empty chain", () => {
		const { result } = renderHook(() => useBreadcrumbChain(symbols, null));
		expect(result.current.chain).toEqual([]);
	});
});
