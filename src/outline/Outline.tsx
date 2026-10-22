import { useEffect, useRef, useState } from "react";
import { type Symbol as LspSymbol, lspSymbols } from "@/project/api";
import { describeError } from "@/project/errors";

const KIND_LABELS: Record<number, string> = {
	1: "file",
	2: "mod",
	3: "ns",
	4: "pkg",
	5: "class",
	6: "method",
	7: "prop",
	8: "field",
	9: "ctor",
	10: "enum",
	11: "interface",
	12: "fn",
	13: "var",
	14: "const",
	15: "str",
	16: "num",
	17: "bool",
	18: "arr",
	19: "obj",
	20: "key",
	21: "null",
	22: "enum",
	23: "struct",
	24: "event",
	25: "op",
	26: "type",
};

function kindLabel(kind: number): string {
	return KIND_LABELS[kind] ?? "sym";
}

const CAP = 400;

export type OutlineProps = {
	root: string;
	activePath: string | null;
	onNavigate: (path: string, line: number, character: number) => void;
	cursor?: { line: number; character: number } | null;
};

function containsRange(symbol: LspSymbol, cursor: { line: number; character: number }): boolean {
	const r = symbol.range;
	if (cursor.line < r.start.line || cursor.line > r.end.line) return false;
	if (cursor.line === r.start.line && cursor.character < r.start.character) return false;
	if (cursor.line === r.end.line && cursor.character > r.end.character) return false;
	return true;
}

function rangeSize(symbol: LspSymbol): number {
	const r = symbol.range;
	return (r.end.line - r.start.line) * 1000000 + (r.end.character - r.start.character);
}

export default function Outline({ root, activePath, onNavigate, cursor }: OutlineProps) {
	const [symbols, setSymbols] = useState<LspSymbol[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seqRef = useRef(0);
	const [filter, setFilter] = useState("");
	const [kbIndex, setKbIndex] = useState(0);
	const highlightRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		setFilter("");
		setKbIndex(0);
	}, [activePath]);

	useEffect(() => {
		if (activePath === null) {
			setSymbols([]);
			setError(null);
			setLoading(false);
			return;
		}
		const seq = ++seqRef.current;
		setLoading(true);
		setError(null);
		const timer = window.setTimeout(() => {
			void (async () => {
				try {
					const result = await lspSymbols(root, activePath);
					if (seqRef.current !== seq) return;
					setSymbols(result);
					setLoading(false);
				} catch (err) {
					if (seqRef.current !== seq) return;
					setError(describeError(err));
					setSymbols([]);
					setLoading(false);
				}
			})();
		}, 300);
		return () => {
			window.clearTimeout(timer);
		};
	}, [root, activePath]);

	const visibleIndices = (() => {
		if (filter.trim() === "") {
			return symbols.map((_, i) => i).slice(0, CAP);
		}
		const needle = filter.toLowerCase();
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
			if (out.length >= CAP) break;
		}
		return out;
	})();

	const shownSymbols = visibleIndices.map((i) => symbols[i]);

	let caretIndex = -1;
	if (cursor !== null && cursor !== undefined) {
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
		caretIndex = best;
	}
	const caretVisibleIndex = caretIndex >= 0 ? visibleIndices.indexOf(caretIndex) : -1;

	useEffect(() => {
		if (highlightRef.current !== null) {
			highlightRef.current.scrollIntoView({ block: "nearest" });
		}
	}, [caretVisibleIndex, visibleIndices.length]);

	const navigateSymbol = (symbol: LspSymbol) => {
		if (activePath === null) return;
		onNavigate(activePath, symbol.range.start.line, symbol.range.start.character);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
		if (shownSymbols.length === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setKbIndex((current) => Math.min(current + 1, shownSymbols.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setKbIndex((current) => Math.max(current - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			const sym = shownSymbols[kbIndex];
			if (sym !== undefined) navigateSymbol(sym);
		}
	};

	const extra = filter.trim() === "" ? symbols.length - Math.min(symbols.length, CAP) : 0;

	return (
		<div className="outline-scroll">
			<div className="rail-head">
				<span className="label">outline</span>
			</div>
			{activePath === null ? (
				<p className="empty">No file open.</p>
			) : (
				<>
					<div className="outline-filter-wrap">
						<input
							type="text"
							className="outline-filter"
							placeholder="filter symbols"
							value={filter}
							onChange={(event) => setFilter(event.target.value)}
						/>
					</div>
					{loading && symbols.length === 0 ? (
						<p className="empty">loading…</p>
					) : error !== null ? (
						<p className="tree-note error">{error}</p>
					) : symbols.length === 0 ? (
						<p className="empty">No symbols.</p>
					) : shownSymbols.length === 0 ? (
						<p className="empty">No symbols match</p>
					) : (
						<ul className="outline-list" tabIndex={0} onKeyDown={handleKeyDown}>
							{shownSymbols.map((symbol, i) => {
								const isCaret = i === caretVisibleIndex;
								const isKb = i === kbIndex;
								return (
									<li
										key={`${symbol.name}-${symbol.range.start.line}-${symbol.range.start.character}-${i}`}
									>
										<button
											type="button"
											ref={isCaret ? highlightRef : undefined}
											className={
												"outline-row" +
												(isCaret ? " outline-active" : "") +
												(isKb ? " outline-kb" : "")
											}
											style={{ paddingLeft: `${8 + symbol.depth * 12}px` }}
											onClick={() => navigateSymbol(symbol)}
										>
											<span className="outline-name">{symbol.name}</span>
											<span className="outline-kind">
												{kindLabel(symbol.kind)}
											</span>
										</button>
									</li>
								);
							})}
							{extra > 0 ? (
								<li>
									<p className="outline-more">+{extra} more</p>
								</li>
							) : null}
						</ul>
					)}
				</>
			)}
		</div>
	);
}
