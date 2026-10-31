import { useEffect, useRef, useState } from "react";
import { diagnosticKey } from "@/lib/lsp/diagnostics";
import { directoryOf, type ProblemFile } from "@/lib/problems/model";
import { ProblemRow } from "./ProblemRow";
import { rowKeyNav } from "./rowKeyNav";
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
	const items = files.flatMap((file) =>
		file.diagnostics.map((diagnostic) => ({ path: file.path, diagnostic })),
	);
	const [selected, setSelected] = useState(0);
	const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

	useEffect(() => {
		if (items.length === 0) {
			setSelected(-1);
			return;
		}
		setSelected((current) => (current < 0 ? 0 : Math.min(current, items.length - 1)));
	}, [items.length]);

	useEffect(() => {
		if (selected < 0) return;
		rowRefs.current[selected]?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	const nav = rowKeyNav(items.length, rowRefs, setSelected);

	let counter = 0;
	return (
		<div className="problems-list-root">
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
						{file.diagnostics.map((diagnostic) => {
							const index = counter++;
							return (
								<ProblemRow
									key={diagnosticKey(diagnostic)}
									path={file.path}
									diagnostic={diagnostic}
									actions={actions}
									onSelect={onSelect}
									selected={index === selected}
									onKeyDown={(event) => nav(index, event)}
									rowRef={(element) => {
										rowRefs.current[index] = element;
									}}
								/>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}
