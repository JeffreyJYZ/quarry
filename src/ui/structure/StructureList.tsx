import type { RefObject } from "react";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { kindLabel } from "@/ui/outline/outlineKinds";

/** The rows: name, kind and line, indented by depth, with one row highlighted. */
export default function StructureList({
	symbols,
	rows,
	active,
	listRef,
	onHover,
	onPick,
}: {
	symbols: LspSymbol[];
	rows: number[];
	active: number;
	listRef: RefObject<HTMLUListElement | null>;
	onHover: (index: number) => void;
	onPick: (symbol: LspSymbol) => void;
}) {
	return (
		<ul className="goto-list" ref={listRef}>
			{rows.map((index, row) => {
				const symbol = symbols[index];
				if (symbol === undefined) return null;
				return (
					<li key={`${symbol.name}-${symbol.range.start.line}-${symbol.depth}`}>
						<button
							type="button"
							className={row === active ? "goto-row active" : "goto-row"}
							style={{ paddingLeft: `${8 + symbol.depth * 12}px` }}
							onMouseEnter={() => onHover(row)}
							onClick={() => onPick(symbol)}
						>
							<span className="goto-label">{symbol.name}</span>
							<span className="structure-kind">{kindLabel(symbol.kind)}</span>
							<span className="structure-line">{symbol.range.start.line + 1}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
