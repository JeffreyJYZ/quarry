import { useCallback, useEffect, useRef, useState } from "react";
import { diagnosticKey } from "@/lsp/diagnostics";
import {
	copyLine,
	directoryOf,
	filterProblemFiles,
	flatProblems,
	type ProblemFile,
} from "@/problems/model";
import type { Diagnostic } from "@/project/api";
import { type CodeAction, lspCodeActions } from "@/project/api";
import { applyFileEdits } from "@/refactor/apply";

const GROUPING_KEY = "quarry.problems.groupByFile";

function storedGrouping(): boolean {
	try {
		return window.sessionStorage.getItem(GROUPING_KEY) !== "flat";
	} catch {
		return true;
	}
}

function storeGrouping(grouped: boolean): void {
	try {
		window.sessionStorage.setItem(GROUPING_KEY, grouped ? "file" : "flat");
	} catch {
		// Session storage can be unavailable; the choice still holds for this mount.
	}
}

export type ProblemsPanelProps = {
	files: ProblemFile[];
	errors: number;
	warnings: number;
	open: boolean;
	onToggle: () => void;
	onSelect: (path: string, line?: number, character?: number) => void;
	activePath: string | null;
	root: string | null;
	buffers: import("@/project/buffer").FileBuffer[];
	setBuffers: (
		updater: (
			current: import("@/project/buffer").FileBuffer[],
		) => import("@/project/buffer").FileBuffer[],
	) => void;
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

function cacheKey(path: string, line: number, character: number): string {
	return `${path}:${line}:${character}`;
}

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

	const [allowed, setAllowed] = useState<Set<number>>(() => new Set([1, 2, 3, 4]));
	const [groupByFile, setGroupByFile] = useState(storedGrouping);

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
			return next;
		});
	};

	const filteredFiles = filterProblemFiles(files, allowed);
	const flat = flatProblems(files, allowed);

	const cache = useRef<Map<string, CodeAction[]>>(new Map());
	const [menuKey, setMenuKey] = useState<string | null>(null);
	const [menuActions, setMenuActions] = useState<CodeAction[]>([]);
	const [menuLoading, setMenuLoading] = useState(false);
	const [menuError, setMenuError] = useState<string | null>(null);
	const [menuIndex, setMenuIndex] = useState(0);
	const [applied, setApplied] = useState<string | null>(null);
	const appliedTimer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (appliedTimer.current !== null) window.clearTimeout(appliedTimer.current);
		},
		[],
	);

	const showApplied = useCallback((title: string) => {
		setApplied(title);
		if (appliedTimer.current !== null) window.clearTimeout(appliedTimer.current);
		appliedTimer.current = window.setTimeout(() => {
			appliedTimer.current = null;
			setApplied(null);
		}, 4000);
	}, []);

	const fetchActions = useCallback(
		async (path: string, line: number, character: number) => {
			const key = cacheKey(path, line, character);
			const cached = cache.current.get(key);
			if (cached !== undefined) {
				return cached;
			}
			if (root === null) {
				return [];
			}
			const actions = await lspCodeActions(root, path, line, character);
			cache.current.set(key, actions);
			return actions;
		},
		[root],
	);

	const openMenu = useCallback(
		async (path: string, line: number, character: number) => {
			const key = cacheKey(path, line, character);
			setMenuKey(key);
			setMenuActions([]);
			setMenuError(null);
			setMenuLoading(true);
			setMenuIndex(0);
			try {
				const actions = await fetchActions(path, line, character);
				setMenuActions(actions);
				if (actions.length === 0) {
					setMenuKey(null);
				}
			} catch (error) {
				setMenuError(error instanceof Error ? error.message : String(error));
				setMenuKey(null);
			} finally {
				setMenuLoading(false);
			}
		},
		[fetchActions],
	);

	const closeMenu = useCallback(() => {
		setMenuKey(null);
		setMenuActions([]);
		setMenuError(null);
		setMenuLoading(false);
	}, []);

	const applyAction = useCallback(
		async (action: CodeAction) => {
			if (action.edits.length === 0) {
				closeMenu();
				return;
			}
			closeMenu();
			try {
				await applyFileEdits(action.edits, buffers, setBuffers);
				showApplied(action.title);
			} catch (error) {
				setMenuError(error instanceof Error ? error.message : String(error));
			}
		},
		[buffers, setBuffers, closeMenu, showApplied],
	);

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
			<div className="problems-head">
				<button
					type="button"
					className="problems-head-toggle"
					onClick={onToggle}
					aria-expanded={true}
				>
					<span className="problems-caret open" aria-hidden="true" />
					<span className="problems-title">Problems</span>
				</button>
				<span className="problems-counts">
					<button
						type="button"
						className={
							allowed.has(1)
								? "problems-filter-option active"
								: "problems-filter-option"
						}
						aria-pressed={allowed.has(1)}
						onClick={(event) => {
							event.stopPropagation();
							toggleSeverity([1]);
						}}
					>
						{errors} errors
					</button>
					<span className="sep">·</span>
					<button
						type="button"
						className={
							allowed.has(2)
								? "problems-filter-option active"
								: "problems-filter-option"
						}
						aria-pressed={allowed.has(2)}
						onClick={(event) => {
							event.stopPropagation();
							toggleSeverity([2]);
						}}
					>
						{warnings} warnings
					</button>
					{other > 0 ? (
						<>
							<span className="sep">·</span>
							<button
								type="button"
								className={
									allowed.has(3) || allowed.has(4)
										? "problems-filter-option active"
										: "problems-filter-option"
								}
								aria-pressed={allowed.has(3) || allowed.has(4)}
								onClick={(event) => {
									event.stopPropagation();
									toggleSeverity([3, 4]);
								}}
							>
								{other} info
							</button>
						</>
					) : null}
					<span className="sep">·</span>
					<button
						type="button"
						className={
							groupByFile ? "problems-filter-option active" : "problems-filter-option"
						}
						aria-pressed={groupByFile}
						onClick={(event) => {
							event.stopPropagation();
							chooseGrouping(!groupByFile);
						}}
					>
						group by file
					</button>
				</span>
			</div>
			{applied !== null ? <div className="problems-applied">Applied: {applied}</div> : null}
			{menuError !== null ? <div className="problems-error">{menuError}</div> : null}
			<div className="problems-body">
				{files.length === 0 ? (
					<p className="problems-empty">No problems</p>
				) : filteredFiles.length === 0 ? (
					<p className="problems-empty">No problems match the filter</p>
				) : groupByFile ? (
					filteredFiles.map((file) => (
						<div
							key={file.path}
							className={
								file.path === activePath ? "problems-file active" : "problems-file"
							}
						>
							<div className="problems-file-head" title={file.path}>
								<span className="problems-file-name">{file.name}</span>
								<span className="problems-file-dir">{directoryOf(file.path)}</span>
								<span className="problems-file-count">
									{file.diagnostics.length}
								</span>
							</div>
							<ul className="problems-list">
								{file.diagnostics.map((diagnostic) => {
									const { line, character } = diagnostic.range.start;
									const key = cacheKey(file.path, line, character);
									const menuOpen = menuKey === key;
									return (
										<li
											key={diagnosticKey(diagnostic)}
											className="problems-item"
										>
											<button
												type="button"
												className="problems-row"
												title={diagnostic.message}
												onClick={() => onSelect(file.path, line, character)}
												onKeyDown={(event) => {
													if (event.altKey && event.key === "Enter") {
														event.preventDefault();
														void openMenu(file.path, line, character);
													}
													if (event.key === "Escape") {
														closeMenu();
													}
												}}
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
											<button
												type="button"
												className="problem-fix"
												onClick={(event) => {
													event.stopPropagation();
													void openMenu(file.path, line, character);
												}}
											>
												Fix
											</button>
											<button
												type="button"
												className="problems-file-copy"
												onClick={(event) => {
													event.stopPropagation();
													void navigator.clipboard.writeText(
														copyLine(file.path, diagnostic),
													);
												}}
											>
												Copy
											</button>
											{menuOpen ? (
												<div className="problem-menu">
													{menuLoading ? (
														<div className="problem-menu-loading">
															Loading…
														</div>
													) : (
														menuActions.map((action, index) => (
															<button
																type="button"
																key={action.title}
																className={
																	index === menuIndex
																		? "problem-menu-item active"
																		: "problem-menu-item"
																}
																onMouseEnter={() =>
																	setMenuIndex(index)
																}
																onClick={(event) => {
																	event.stopPropagation();
																	void applyAction(action);
																}}
															>
																{action.title}
															</button>
														))
													)}
												</div>
											) : null}
										</li>
									);
								})}
							</ul>
						</div>
					))
				) : (
					<ul className="problems-list">
						{flat.map((row) => {
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
										<span className="problem-message">
											{row.diagnostic.message}
										</span>
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
				)}
			</div>
		</section>
	);
}
