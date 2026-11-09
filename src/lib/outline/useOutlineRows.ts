import { useMemo } from "react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { filterSymbolIndices } from "./model";

/**
 * The rows an outline draws, derived once per symbol list and filter.
 *
 * A caret move only changes which row is highlighted, so without this the filter and its parent
 * chain were rebuilt on every cursor update.
 */
export function useOutlineRows(
	symbols: LspSymbol[],
	filter: string,
	cap: number,
): { visibleIndices: number[]; cappedIndices: number[]; shownSymbols: LspSymbol[] } {
	const visibleIndices = useMemo(
		() => filterSymbolIndices(symbols, filter, cap),
		[symbols, filter, cap],
	);
	const cappedIndices = useMemo(
		() => (filter.trim() === "" ? visibleIndices.slice(0, cap) : visibleIndices),
		[filter, visibleIndices, cap],
	);
	const shownSymbols = useMemo(
		() => cappedIndices.map((index) => symbols[index]),
		[cappedIndices, symbols],
	);
	return { visibleIndices, cappedIndices, shownSymbols };
}
