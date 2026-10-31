import { useEffect, useRef, useState } from "react";
import { diagnosticKey } from "@/lib/lsp/diagnostics";
import { copyLine, type FlatProblem } from "@/lib/problems/model";
import { rowKeyNav } from "./rowKeyNav";
import { SEVERITY_CLASS } from "./parts";

export function FlatProblems({
	rows,
	onSelect,
}: {
	rows: FlatProblem[];
	onSelect: (path: string, line?: number, character?: number) => void;
}) {
	const [selected, setSelected] = useState(0);
	const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

	useEffect(() => {
		if (rows.length === 0) {
			setSelected(-1);
			return;
		}
		setSelected((current) => (current < 0 ? 0 : Math.min(current, rows.length - 1)));
	}, [rows.length]);

	useEffect(() => {
		if (selected < 0) return;
		rowRefs.current[selected]?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	const nav = rowKeyNav(rows.length, rowRefs, setSelected);

	return (
		<div className="problems-list-root">
			<ul className="problems-list">
				{rows.map((row, index) => {
					const { line, character } = row.diagnostic.range.start;
					return (
						<li key={diagnosticKey(row.diagnostic)} className="problems-item">
							<button
								type="button"
								ref={(element) => {
									rowRefs.current[index] = element;
								}}
								className={
									index === selected ? "problems-row selected" : "problems-row"
								}
								title={row.diagnostic.message}
								onClick={() => onSelect(row.path, line, character)}
								onKeyDown={(event) => nav(index, event)}
							>
								<span
									className={`problem-dot ${SEVERITY_CLASS[row.diagnostic.severity]}`}
									aria-hidden="true"
								/>
								<span className="problem-pos">
									{row.name} {line + 1}:{character + 1}
								</span>
								<span className="problem-message">{row.diagnostic.message}</span>
							</button>
							<button
								type="button"
								className="problems-file-copy"
								onClick={(event) => {
									event.stopPropagation();
									void navigator.clipboard.writeText(
										copyLine(row.path, row.diagnostic),
									);
								}}
							>
								Copy
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
