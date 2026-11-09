import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";

export type Position = { line: number; character: number };

/** Whether the position sits inside the symbol's range, both ends inclusive. */
export function containsRange(symbol: LspSymbol, cursor: Position): boolean {
	const r = symbol.range;
	if (cursor.line < r.start.line || cursor.line > r.end.line) return false;
	if (cursor.line === r.start.line && cursor.character < r.start.character) return false;
	if (cursor.line === r.end.line && cursor.character > r.end.character) return false;
	return true;
}

/** One comparable number per range: lines dominate, characters break the tie. */
export function rangeSize(symbol: LspSymbol): number {
	const r = symbol.range;
	return (r.end.line - r.start.line) * 1000000 + (r.end.character - r.start.character);
}

/** Largest range first, so a list of containing symbols reads outermost to innermost. */
export function byRangeDesc(left: LspSymbol, right: LspSymbol): number {
	return rangeSize(right) - rangeSize(left);
}
