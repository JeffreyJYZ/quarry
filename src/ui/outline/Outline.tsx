import { useEffect, useRef, useState } from "react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { useOutlineSymbols } from "@/lib/outline/useOutlineSymbols";
import { useRunningSessions } from "@/lib/lsp/useLspContext";

import { caretSymbolIndex } from "@/lib/outline/model";
import { useOutlineRows } from "@/lib/outline/useOutlineRows";
import { kindLabel } from "./outlineKinds";
import "./outline.css";

const CAP = 400;

export type OutlineProps = {
	root: string;
	activePath: string | null;
	onNavigate: (path: string, line: number, character: number) => void;
	cursor?: { line: number; character: number } | null;
};

export default function Outline({ root, activePath, onNavigate, cursor }: OutlineProps) {
	const running = useRunningSessions();
	const { symbols, loading, error, noServer } = useOutlineSymbols(root, activePath, running);
	const [filter, setFilter] = useState("");
	const [kbIndex, setKbIndex] = useState(0);
	const highlightRef = useRef<HTMLButtonElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a path change must clear the per-file filter
	useEffect(() => {
		setFilter("");
		setKbIndex(0);
	}, [activePath]);

	// The cap is on what is drawn, not only on what the "+N more" line counts: a C file with a few
	// hundred symbols would otherwise render every row and shout about a limit it never applied.
	const { visibleIndices, cappedIndices, shownSymbols } = useOutlineRows(symbols, filter, CAP);

	useEffect(() => {
		setKbIndex((current) =>
			shownSymbols.length === 0 ? 0 : Math.min(current, shownSymbols.length - 1),
		);
	}, [shownSymbols.length]);

	const caretIndex = caretSymbolIndex(symbols, cursor ?? null);
	const caretVisibleIndex = caretIndex >= 0 ? cappedIndices.indexOf(caretIndex) : -1;

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
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									setFilter("");
								}
							}}
						/>
					</div>
					{loading && symbols.length === 0 ? (
						<p className="empty">loading…</p>
					) : error !== null ? (
						<p className="tree-note error">{error}</p>
					) : noServer ? (
						<p className="empty">No language server for this file</p>
					) : symbols.length === 0 ? (
						<p className="empty">No symbols.</p>
					) : shownSymbols.length === 0 ? (
						<p className="empty">No symbol matches</p>
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
