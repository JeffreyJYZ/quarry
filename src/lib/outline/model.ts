import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { containsRange, rangeSize } from "@/lib/lsp/ranges";

export function caretSymbolIndex(
	symbols: readonly LspSymbol[],
	cursor: { line: number; character: number } | null,
): number {
	if (cursor === null) return -1;
	let best = -1;
	let bestSize = Infinity;
	let bestDepth = -1;
	symbols.forEach((s, i) => {
		if (!containsRange(s, cursor)) return;
		const size = rangeSize(s);
		if (size < bestSize || (size === bestSize && s.depth > bestDepth)) {
			bestSize = size;
			bestDepth = s.depth;
			best = i;
		}
	});
	return best;
}

export function filterSymbolIndices(
	symbols: readonly LspSymbol[],
	filter: string,
	cap = 400,
): number[] {
	const needle = filter.trim().toLowerCase();
	if (needle === "") {
		const out: number[] = [];
		for (let i = 0; i < symbols.length && out.length < cap; i += 1) out.push(i);
		return out;
	}
	const matching = new Set<number>();
	symbols.forEach((s, i) => {
		if (s.name.toLowerCase().includes(needle)) matching.add(i);
	});
	const keep = new Set<number>();
	for (const idx of matching) {
		keep.add(idx);
		let depth = symbols[idx].depth;
		for (let i = idx - 1; i >= 0; i -= 1) {
			if (symbols[i].depth < depth) {
				keep.add(i);
				depth = symbols[i].depth;
				if (depth <= 0) break;
			}
		}
	}
	const out: number[] = [];
	for (let i = 0; i < symbols.length; i += 1) {
		if (keep.has(i)) out.push(i);
		if (out.length >= cap) break;
	}
	return out;
}
