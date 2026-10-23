import { diagnosticKey } from "@/lib/lsp/diagnostics";
import { directoryOf, type ProblemFile } from "@/lib/problems/model";
import { ProblemRow } from "./ProblemRow";
import type { ProblemActions } from "./useProblemActions";

export function ProblemsList({
	files,
	activePath,
	onSelect,
	actions,
}: {
	files: ProblemFile[];
	activePath: string | null;
	onSelect: (path: string, line?: number, character?: number) => void;
	actions: ProblemActions;
}) {
	return (
		<>
			{files.map((file) => (
				<div
					key={file.path}
					className={file.path === activePath ? "problems-file active" : "problems-file"}
				>
					<div className="problems-file-head" title={file.path}>
						<span className="problems-file-name">{file.name}</span>
						<span className="problems-file-dir">{directoryOf(file.path)}</span>
						<span className="problems-file-count">{file.diagnostics.length}</span>
					</div>
					<ul className="problems-list">
						{file.diagnostics.map((diagnostic) => (
							<ProblemRow
								key={diagnosticKey(diagnostic)}
								path={file.path}
								diagnostic={diagnostic}
								actions={actions}
								onSelect={onSelect}
							/>
						))}
					</ul>
				</div>
			))}
		</>
	);
}
