import { diagnosticKey } from "@/lib/lsp/diagnostics";
import { copyLine, type FlatProblem } from "@/lib/problems/model";
import { SEVERITY_CLASS } from "./parts";

export function FlatProblems({
	rows,
	onSelect,
}: {
	rows: FlatProblem[];
	onSelect: (path: string, line?: number, character?: number) => void;
}) {
	return (
		<ul className="problems-list">
			{rows.map((row) => {
				const { line, character } = row.diagnostic.range.start;
				return (
					<li key={diagnosticKey(row.diagnostic)} className="problems-item">
						<button
							type="button"
							className="problems-row"
							title={row.diagnostic.message}
							onClick={() => onSelect(row.path, line, character)}
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
	);
}
