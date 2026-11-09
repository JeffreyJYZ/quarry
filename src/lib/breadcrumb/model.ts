import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { byRangeDesc, containsRange, type Position } from "@/lib/lsp/ranges";

export function qualifiedName(parts: readonly string[]): string {
	return parts.join("::");
}

/** Symbols the cursor sits inside, in the order they already carry. */
export function containingSymbols(
	ordered: readonly LspSymbol[],
	cursor: Position | null,
): LspSymbol[] {
	return cursor === null ? [] : ordered.filter((symbol) => containsRange(symbol, cursor));
}

/** Largest range first, so the first containing symbol is the outermost one. */
export function sortedByRange(symbols: readonly LspSymbol[]): LspSymbol[] {
	return [...symbols].sort(byRangeDesc);
}
