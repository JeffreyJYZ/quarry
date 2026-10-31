import { useState } from "react";
import { filterProblemFiles, flatProblems, type ProblemFile } from "@/lib/problems/model";
import { FlatProblems } from "./FlatProblems";
import { ProblemsHead } from "./ProblemsHead";
import { ProblemsList } from "./ProblemsList";
import {
	storeAllowed,
	storeGrouping,
	storeTextFilter,
	storedAllowed,
	storedGrouping,
	storedTextFilter,
} from "./parts";
import { useProblemActions } from "./useProblemActions";
import "./problems.css";

export type ProblemsPanelProps = {
	files: ProblemFile[];
	errors: number;
	warnings: number;
	open: boolean;
	onToggle: () => void;
	onSelect: (path: string, line?: number, character?: number) => void;
	activePath: string | null;
	root: string | null;
	buffers: import("@/lib/project/buffer").FileBuffer[];
	setBuffers: (
		updater: (
			current: import("@/lib/project/buffer").FileBuffer[],
		) => import("@/lib/project/buffer").FileBuffer[],
	) => void;
};

export default function ProblemsPanel({
	files,
	errors,
	warnings,
	open,
	onToggle,
	onSelect,
	activePath,
	root,
	buffers,
	setBuffers,
}: ProblemsPanelProps) {
	const total = files.reduce((sum, file) => sum + file.diagnostics.length, 0);
	const other = total - errors - warnings;

	const [allowed, setAllowed] = useState<Set<number>>(() => storedAllowed());
	const [groupByFile, setGroupByFile] = useState(storedGrouping);
	const [textFilter, setTextFilter] = useState(storedTextFilter);

	const chooseGrouping = (grouped: boolean) => {
		setGroupByFile(grouped);
		storeGrouping(grouped);
	};

	const toggleSeverity = (severities: number[]) => {
		setAllowed((current) => {
			const next = new Set(current);
			const allOn = severities.every((severity) => next.has(severity));
			if (allOn) {
				for (const severity of severities) next.delete(severity);
			} else {
				for (const severity of severities) next.add(severity);
			}
			storeAllowed(next);
			return next;
		});
	};

	const changeTextFilter = (value: string) => {
		setTextFilter(value);
		storeTextFilter(value);
	};

	const filteredFiles = filterProblemFiles(files, allowed, textFilter);
	const flat = flatProblems(files, allowed, textFilter);
	const actions = useProblemActions({ root, buffers, setBuffers });

	if (!open) {
		return (
			<section className="problems collapsed" aria-label="Problems">
				<button
					type="button"
					className="problems-head"
					onClick={onToggle}
					aria-expanded={false}
				>
					<span className="problems-caret" aria-hidden="true" />
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
			</section>
		);
	}

	return (
		<section className="problems" aria-label="Problems">
			<ProblemsHead
				errors={errors}
				warnings={warnings}
				other={other}
				allowed={allowed}
				groupByFile={groupByFile}
				textFilter={textFilter}
				onToggle={onToggle}
				onToggleSeverity={toggleSeverity}
				onChooseGrouping={chooseGrouping}
				onChangeTextFilter={changeTextFilter}
			/>
			{actions.applied !== null ? (
				<div className="problems-applied">Applied: {actions.applied}</div>
			) : null}
			{actions.menuError !== null ? (
				<div className="problems-error">{actions.menuError}</div>
			) : null}
			<div className="problems-body">
				{files.length === 0 ? (
					<p className="problems-empty">No problems</p>
				) : filteredFiles.length === 0 ? (
					<p className="problems-empty">
						No problems match the filter
						{textFilter.trim() !== "" ? ` "${textFilter.trim()}"` : ""}
					</p>
				) : groupByFile ? (
					<ProblemsList
						files={filteredFiles}
						activePath={activePath}
						onSelect={onSelect}
						actions={actions}
					/>
				) : (
					<FlatProblems rows={flat} onSelect={onSelect} />
				)}
			</div>
		</section>
	);
}
