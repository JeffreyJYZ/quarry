import { useEffect, useRef, useState } from "react";
import { type Symbol as LspSymbol, lspSymbols } from "@/project/api";
import { describeError } from "@/project/errors";
import { caretSymbolIndex, filterSymbolIndices } from "./model";

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

export default function Outline({ root, activePath, onNavigate, cursor }: OutlineProps) {
	const [symbols, setSymbols] = useState<LspSymbol[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seqRef = useRef(0);
	const [filter, setFilter] = useState("");
	const [kbIndex, setKbIndex] = useState(0);
	const highlightRef = useRef<HTMLButtonElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a path change must clear the per-file filter
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

	const visibleIndices = filterSymbolIndices(symbols, filter);

	const shownSymbols = visibleIndices.map((i) => symbols[i]);

	useEffect(() => {
		setKbIndex((current) =>
			shownSymbols.length === 0 ? 0 : Math.min(current, shownSymbols.length - 1),
		);
	}, [shownSymbols.length]);

	const caretIndex = caretSymbolIndex(symbols, cursor ?? null);
	const caretVisibleIndex = caretIndex >= 0 ? visibleIndices.indexOf(caretIndex) : -1;

	// biome-ignore lint/correctness/useExhaustiveDependencies: the scroll target depends on the visible set
	useEffect(() => {
		if (highlightRef.current !== null) {
			highlightRef.current.scrollIntoView({ block: "nearest" });
		}
	}, [caretVisibleIndex, visibleIndices.length]);

	const navigateSymbol = (symbol: LspSymbol) => {
		if (activePath === null) return;
		onNavigate(activePath, symbol.range.start.line, symbol.range.start.character);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
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
						<ul className="outline-list">
							{shownSymbols.map((symbol, i) => {
								const isCaret = i === caretVisibleIndex;
								const isKb = i === kbIndex;
								return (
									<li
										key={`${symbol.name}-${symbol.range.start.line}-${symbol.range.start.character}-${symbol.depth}`}
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
											onKeyDown={handleKeyDown}
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
