import { useMemo } from "react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import type { Position } from "@/lib/lsp/ranges";
import { containingSymbols, sortedByRange } from "./model";

/**
 * The breadcrumb chain for one cursor.
 *
 * Ordering is the expensive half and depends on the symbol list alone, so a caret move filters a
 * list that is already sorted instead of sorting every containing symbol again. The filter is cheap
 * and stays outside the memo, which is what keeps this correct as the cursor moves.
 */
export function useBreadcrumbChain(
	symbols: LspSymbol[],
	cursor: Position | null,
): { ordered: LspSymbol[]; chain: LspSymbol[] } {
	const ordered = useMemo(() => sortedByRange(symbols), [symbols]);
	return { ordered, chain: containingSymbols(ordered, cursor) };
}
