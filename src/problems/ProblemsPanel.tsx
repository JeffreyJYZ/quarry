import { diagnosticKey } from "@/lsp/diagnostics";
import { directoryOf, type ProblemFile } from "@/problems/model";
import type { Diagnostic } from "@/project/api";

export type ProblemsPanelProps = {
	files: ProblemFile[];
	errors: number;
	warnings: number;
	open: boolean;
	onToggle: () => void;
	onSelect: (path: string) => void;
	activePath: string | null;
};

const SEVERITY_CLASS: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

const SEVERITY_LABEL: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "information",
	4: "hint",
};

/**
 * Bottom dock listing every problem, grouped by file. It only renders what the store holds; the
 * editor and the app own the diagnostics themselves.
 */
export default function ProblemsPanel({
	files,
	errors,
	warnings,
	open,
	onToggle,
	onSelect,
	activePath,
}: ProblemsPanelProps) {
	const total = files.reduce((sum, file) => sum + file.diagnostics.length, 0);
	const other = total - errors - warnings;

	return (
		<section className={open ? "problems" : "problems collapsed"} aria-label="Problems">
			<button type="button" className="problems-head" onClick={onToggle} aria-expanded={open}>
				<span
					className={open ? "problems-caret open" : "problems-caret"}
					aria-hidden="true"
				/>
				<span className="problems-title">Problems</span>
				<span className="problems-counts">
					<span className="count error">{errors} errors</span>
					<span className="sep">·</span>
					<span className="count warning">{warnings} warnings</span>
					{other > 0 ? (
						<>
							<span className="sep">·</span>
							<span className="count">{other} info</span>
						</>
					) : null}
				</span>
			</button>
			{open ? (
				<div className="problems-body">
					{files.length === 0 ? (
						<p className="problems-empty">No problems</p>
					) : (
						files.map((file) => (
							<div
								key={file.path}
								className={
									file.path === activePath
										? "problems-file active"
										: "problems-file"
								}
							>
								<div className="problems-file-head" title={file.path}>
									<span className="problems-file-name">{file.name}</span>
									<span className="problems-file-dir">
										{directoryOf(file.path)}
									</span>
									<span className="problems-file-count">
										{file.diagnostics.length}
									</span>
								</div>
								<ul className="problems-list">
									{file.diagnostics.map((diagnostic) => {
										const { line, character } = diagnostic.range.start;
										return (
											<li
												key={diagnosticKey(diagnostic)}
												className="problems-item"
											>
												<button
													type="button"
													className="problems-row"
													title={diagnostic.message}
													onClick={() => onSelect(file.path)}
												>
													<span
														className={`problem-dot ${SEVERITY_CLASS[diagnostic.severity]}`}
														aria-hidden="true"
													/>
													<span className="problem-pos">
														{line + 1}:{character + 1}
													</span>
													<span className="problem-message">
														{diagnostic.message}
													</span>
													<span className="problem-source">
														{diagnostic.source ??
															SEVERITY_LABEL[diagnostic.severity]}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
							</div>
						))
					)}
				</div>
			) : null}
		</section>
	);
}
