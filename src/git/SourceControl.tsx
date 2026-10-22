import { useCallback, useEffect, useRef, useState } from "react";
import { groupBlame } from "@/git/blame";
import type { BlameLine, GitCommitEntry } from "@/project/api";
import {
	type Branch,
	type GitStatus,
	type GitStatusEntry,
	gitBlame,
	gitBranches,
	gitCheckout,
	gitCommit,
	gitDiscard,
	gitFileDiff,
	gitLog,
	gitStage,
	gitUnstage,
} from "@/project/api";
import { describeError } from "@/project/errors";

export type SourceControlProps = {
	root: string;
	refreshToken: number;
	status: GitStatus | null;
	activePath: string | null;
	saveToken?: number;
	onRefresh: () => Promise<void>;
	onOpenFile: (path: string) => void;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
	onNavigate: (path: string, line: number, character: number) => void;
	diffPath: string | null;
};

const STATUS_LETTER: Record<GitStatusEntry["status"], string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "?",
	conflicted: "!",
};

const STATUS_CLASS: Record<GitStatusEntry["status"], string> = {
	modified: "git-status-modified",
	added: "git-status-added",
	deleted: "git-status-deleted",
	renamed: "git-status-renamed",
	untracked: "git-status-untracked",
	conflicted: "git-status-conflicted",
};

function dirOf(path: string): string {
	const index = path.lastIndexOf("/");
	if (index <= 0) return "";
	return path.slice(0, index);
}

function nameOf(path: string): string {
	const index = path.lastIndexOf("/");
	return index >= 0 ? path.slice(index + 1) : path;
}

function relativeTime(iso: string): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return iso;
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.round(months / 12)}y ago`;
}

export default function SourceControl({
	root,
	refreshToken,
	status: statusProp,
	activePath,
	saveToken,
	onRefresh,
	onOpenFile,
	onDiff,
	onCommitDiff,
	onNavigate,
	diffPath,
}: SourceControlProps) {
	const status = statusProp;
	const stagedCount = status?.entries.filter((entry) => entry.staged).length ?? 0;
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState<Set<string>>(() => new Set<string>());
	const [selected, setSelected] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const [commitError, setCommitError] = useState<string | null>(null);
	const [committed, setCommitted] = useState<string | null>(null);
	const [committing, setCommitting] = useState(false);
	const committedTimer = useRef<number | null>(null);

	const [branches, setBranches] = useState<Branch[] | null>(null);
	const [branchOpen, setBranchOpen] = useState(false);
	const [branchFilter, setBranchFilter] = useState("");
	const [branchIndex, setBranchIndex] = useState(0);
	const [branchSwitching, setBranchSwitching] = useState(false);
	const [branchSwitched, setBranchSwitched] = useState<string | null>(null);
	const [missingDiff, setMissingDiff] = useState<string | null>(null);
	const [tab, setTab] = useState<"changes" | "history" | "blame">("changes");
	const [blameCache, setBlameCache] = useState<Map<string, BlameLine[]>>(() => new Map());
	const [blameLoading, setBlameLoading] = useState(false);
	const [blameError, setBlameError] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
	const [discardPaths, setDiscardPaths] = useState<string[] | null>(null);
	const [discarding, setDiscarding] = useState(false);
	const [history, setHistory] = useState<GitCommitEntry[] | null>(null);
	const [historyLimit, setHistoryLimit] = useState(50);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [historySelected, setHistorySelected] = useState<number | null>(null);
	const switchedTimer = useRef<number | null>(null);
	const filterRef = useRef<HTMLInputElement | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			await onRefresh();
			setError(null);
		} catch (err) {
			setError(describeError(err));
		} finally {
			setLoading(false);
		}
		onCommitDiff(null);
	}, [onRefresh, onCommitDiff]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an explicit refresh trigger
	useEffect(() => {
		void refresh();
	}, [refreshToken]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await gitBranches(root);
				if (cancelled) return;
				setBranches(list);
			} catch {
				if (cancelled) return;
				setBranches([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [root]);

	const stage = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;
			setBusy((current) => {
				const next = new Set(current);
				for (const path of paths) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitStage(root, paths);
				await refresh();
			} catch (err) {
				setError(describeError(err));
			} finally {
				setBusy((current) => {
					const next = new Set(current);
					for (const path of paths) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh],
	);

	const unstage = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;
			setBusy((current) => {
				const next = new Set(current);
				for (const path of paths) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitUnstage(root, paths);
				await refresh();
			} catch (err) {
				setError(describeError(err));
			} finally {
				setBusy((current) => {
					const next = new Set(current);
					for (const path of paths) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh],
	);

	const discard = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;
			setDiscarding(true);
			setBusy((current) => {
				const next = new Set(current);
				for (const path of paths) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitDiscard(root, paths);
				if (diffPath !== null && paths.includes(diffPath)) {
					onDiff(null);
				}
				await refresh();
				setDiscardPaths(null);
			} catch (err) {
				setError(describeError(err));
			} finally {
				setDiscarding(false);
				setBusy((current) => {
					const next = new Set(current);
					for (const path of paths) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh, diffPath, onDiff],
	);

	const loadHistory = useCallback(
		async (limit: number) => {
			setHistoryLoading(true);
			setHistoryError(null);
			try {
				const entries = await gitLog(root, limit);
				setHistory(entries);
				setHistoryLimit(limit);
				setHistorySelected(null);
			} catch (err) {
				setHistoryError(describeError(err));
			} finally {
				setHistoryLoading(false);
			}
		},
		[root],
	);

	const commit = useCallback(async () => {
		const trimmed = message.trim();
		if (trimmed === "" || stagedCount === 0 || committing) return;
		setCommitting(true);
		setCommitError(null);
		try {
			const hash = await gitCommit(root, trimmed);
			setMessage("");
			setCommitted(hash);
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
			committedTimer.current = window.setTimeout(() => {
				committedTimer.current = null;
				setCommitted(null);
			}, 4000);
			await refresh();
			await loadHistory(historyLimit);
			onDiff(null);
			onCommitDiff(null);
		} catch (err) {
			setCommitError(describeError(err));
		} finally {
			setCommitting(false);
		}
	}, [
		message,
		stagedCount,
		committing,
		root,
		refresh,
		onDiff,
		onCommitDiff,
		loadHistory,
		historyLimit,
	]);

	// Refresh history when the History tab is opened.
	useEffect(() => {
		if (tab !== "history") return;
		void loadHistory(historyLimit);
	}, [tab, loadHistory, historyLimit]);

	// Load blame lazily for the active file.
	useEffect(() => {
		if (tab !== "blame") return;
		if (activePath === null) return;
		const cached = blameCache.get(activePath);
		if (cached !== undefined) {
			setBlameError(null);
			return;
		}
		let cancelled = false;
		setBlameLoading(true);
		setBlameError(null);
		void (async () => {
			try {
				const result = await gitBlame(root, activePath);
				if (cancelled) return;
				setBlameCache((current) => {
					const next = new Map(current);
					next.set(activePath, result);
					return next;
				});
			} catch (err) {
				if (cancelled) return;
				setBlameError(describeError(err));
			} finally {
				if (!cancelled) setBlameLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [tab, activePath, root, blameCache]);

	// Refetch after save.
	useEffect(() => {
		if (saveToken === undefined) return;
		if (activePath === null) return;
		setBlameCache((current) => {
			const next = new Map(current);
			next.delete(activePath);
			return next;
		});
		setCollapsed(new Set());
		if (tab === "blame") {
			// trigger reload by toggling loading
			setBlameLoading(true);
		}
	}, [saveToken, activePath, tab]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		return () => {
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
			if (switchedTimer.current !== null) {
				window.clearTimeout(switchedTimer.current);
			}
		};
	}, []);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (tab !== "history") return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			if (event.key === "Tab") {
				event.preventDefault();
				setTab("changes");
				onCommitDiff(null);
				return;
			}
			const list = history ?? [];
			if (list.length === 0) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHistorySelected((current) => {
					if (current === null) return 0;
					return Math.min(current + 1, list.length - 1);
				});
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHistorySelected((current) => {
					if (current === null) return 0;
					return Math.max(current - 1, 0);
				});
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const entry =
					historySelected !== null ? (history?.[historySelected] ?? null) : null;
				if (entry !== null) {
					setHistorySelected(historySelected);
					onCommitDiff(entry.hash);
					onDiff(null);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [tab, history, historySelected, onCommitDiff, onDiff]);

	// Tab switches from Changes to History too.
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (tab !== "changes") return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			if (event.key === "Tab") {
				event.preventDefault();
				setTab("history");
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [tab]);

	useEffect(() => {
		if (branchOpen) {
			setBranchFilter("");
			setBranchIndex(0);
			window.setTimeout(() => filterRef.current?.focus(), 0);
		}
	}, [branchOpen]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key !== "Enter") return;
			if (selected === null || status === null) return;
			const entry = status.entries.find((item) => item.path === selected);
			if (!entry) return;
			event.preventDefault();
			if (event.shiftKey) {
				if (entry.staged) void unstage([entry.path]);
			} else {
				if (!entry.staged) void stage([entry.path]);
			}
		};
		window.addEventListener("keydown", handler, true);
		return () => window.removeEventListener("keydown", handler, true);
	}, [selected, status, stage, unstage]);

	const switchBranch = useCallback(
		async (branch: string) => {
			if (branchSwitching) return;
			setBranchSwitching(true);
			setError(null);
			try {
				await gitCheckout(root, branch);
				await onRefresh();
				await loadHistory(historyLimit);
				setBranches(await gitBranches(root).catch(() => branches ?? []));
				setBranchOpen(false);
				onCommitDiff(null);
				if (diffPath !== null) {
					try {
						await gitFileDiff(root, diffPath);
						onDiff(null);
						window.setTimeout(() => onDiff(diffPath), 0);
					} catch {
						onDiff(null);
						setMissingDiff("File not on this branch");
					}
				}
				setBranchSwitched(`Switched to ${branch}`);
				if (switchedTimer.current !== null) {
					window.clearTimeout(switchedTimer.current);
				}
				switchedTimer.current = window.setTimeout(() => {
					switchedTimer.current = null;
					setBranchSwitched(null);
				}, 4000);
			} catch (err) {
				setError(describeError(err));
			} finally {
				setBranchSwitching(false);
			}
		},
		[
			root,
			onRefresh,
			branchSwitching,
			branches,
			diffPath,
			onDiff,
			loadHistory,
			historyLimit,
			onCommitDiff,
		],
	);

	if (status === null && error === null && loading) {
		return (
			<aside className="rail">
				<div className="rail-head">
					<span className="label">Source control</span>
				</div>
				<p className="empty">Loading…</p>
			</aside>
		);
	}

	if (error !== null && status === null) {
		return (
			<aside className="rail">
				<div className="rail-head">
					<span className="label">Source control</span>
				</div>
				<p className="empty error">{error}</p>
			</aside>
		);
	}

	if (status === null || status.branch === null) {
		return null;
	}

	const staged = status.entries.filter((entry) => entry.staged);
	const changes = status.entries.filter((entry) => !entry.staged);

	const filteredBranches = (branches ?? []).filter((branch) =>
		branch.name.toLowerCase().includes(branchFilter.toLowerCase()),
	);
	const isRepo = (branches ?? []).length > 0;

	const renderRow = (entry: GitStatusEntry) => {
		const isBusy = busy.has(entry.path);
		return (
			<li
				key={`${entry.staged ? "s" : "c"}:${entry.path}`}
				className={`git-row${isBusy ? " git-row-busy" : ""}${selected === entry.path ? " git-row-selected" : ""}`}
			>
				<button
					type="button"
					className="git-row-main"
					onClick={() => {
						setSelected(entry.path);
						onOpenFile(entry.path);
					}}
					title={entry.path}
				>
					<span className={`git-status-letter ${STATUS_CLASS[entry.status]}`}>
						{STATUS_LETTER[entry.status]}
					</span>
					<span className="git-row-name">{nameOf(entry.path)}</span>
					<span className="git-row-dir">{dirOf(entry.path)}</span>
				</button>
				{entry.staged ? (
					// Staged rows offer no discard affordance: their content lives in the
					// index, so unstaging first is the honest path.
					<button
						type="button"
						className="git-stage-btn"
						disabled={isBusy}
						onClick={() => void unstage([entry.path])}
						aria-label={`unstage ${entry.path}`}
					>
						Unstage
					</button>
				) : (
					<>
						<button
							type="button"
							className="git-discard-btn"
							disabled={isBusy || discarding}
							onClick={() => setDiscardPaths([entry.path])}
							onKeyDown={(event) => {
								if (
									event.metaKey &&
									!event.ctrlKey &&
									!event.altKey &&
									event.key === "Backspace"
								) {
									event.preventDefault();
									setDiscardPaths([entry.path]);
								}
							}}
							aria-label={`discard ${entry.path}`}
						>
							Discard
						</button>
						<button
							type="button"
							className="git-stage-btn"
							disabled={isBusy}
							onClick={() => void stage([entry.path])}
							aria-label={`stage ${entry.path}`}
						>
							Stage
						</button>
					</>
				)}
				<button
					type="button"
					className="git-diff-btn"
					onClick={() => {
						setMissingDiff(null);
						onDiff(entry.path);
					}}
					aria-label={`diff ${entry.path}`}
				>
					diff
				</button>
			</li>
		);
	};

	return (
		<aside className="rail">
			<div className="rail-head" style={{ position: "relative" }}>
				<span className="label">Source control</span>
				{isRepo ? (
					<button
						type="button"
						className="git-branch git-branch-btn"
						onClick={() => setBranchOpen((current) => !current)}
					>
						{status.branch}
					</button>
				) : (
					<span className="git-branch">{status.branch}</span>
				)}
				{branchOpen && isRepo ? (
					<div className="git-branch-menu">
						<input
							ref={filterRef}
							className="git-branch-filter"
							value={branchFilter}
							onChange={(event) => {
								setBranchFilter(event.target.value);
								setBranchIndex(0);
							}}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									setBranchOpen(false);
									return;
								}
								if (event.key === "ArrowDown") {
									event.preventDefault();
									setBranchIndex((current) =>
										Math.min(
											current + 1,
											Math.max(0, filteredBranches.length - 1),
										),
									);
									return;
								}
								if (event.key === "ArrowUp") {
									event.preventDefault();
									setBranchIndex((current) => Math.max(current - 1, 0));
									return;
								}
								if (event.key === "Enter") {
									event.preventDefault();
									const target = filteredBranches[branchIndex];
									if (target !== undefined && !branchSwitching) {
										void switchBranch(target.name);
									}
								}
							}}
							placeholder="Filter branches"
						/>
						<ul
							className={`git-branch-list${branchSwitching ? " git-branch-list-busy" : ""}`}
						>
							{filteredBranches.map((branch, index) => (
								<li key={branch.name}>
									<button
										type="button"
										className={`git-branch-option${index === branchIndex ? " git-branch-option-active" : ""}`}
										disabled={branchSwitching}
										onClick={() => void switchBranch(branch.name)}
									>
										<span className="git-branch-mark">
											{branch.current ? "●" : " "}
										</span>
										{branch.name}
									</button>
								</li>
							))}
						</ul>
						{error !== null ? <p className="git-branch-error">{error}</p> : null}
					</div>
				) : null}
			</div>
			{branchSwitched !== null ? <p className="git-committed">{branchSwitched}</p> : null}
			{missingDiff !== null ? <p className="git-committed">{missingDiff}</p> : null}
			<div className="git-tabs">
				<button
					type="button"
					className={`git-tab${tab === "changes" ? " git-tab-active" : ""}`}
					onClick={() => {
						setTab("changes");
						onCommitDiff(null);
					}}
				>
					Changes
				</button>
				<button
					type="button"
					className={`git-tab${tab === "history" ? " git-tab-active" : ""}`}
					onClick={() => setTab("history")}
				>
					History
				</button>
				{activePath !== null ? (
					<button
						type="button"
						className={`git-tab${tab === "blame" ? " git-tab-active" : ""}`}
						onClick={() => setTab("blame")}
					>
						Blame
					</button>
				) : null}
			</div>
			{tab === "changes" ? (
				<>
					<div className="git-commit-box">
						<textarea
							className="git-commit-input"
							rows={Math.min(5, Math.max(2, message.split("\\n").length))}
							placeholder="Commit message"
							value={message}
							onChange={(event) => {
								setMessage(event.target.value);
								setCommitError(null);
							}}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.currentTarget.blur();
									return;
								}
								if (
									event.metaKey &&
									!event.ctrlKey &&
									!event.altKey &&
									event.key === "Enter"
								) {
									event.preventDefault();
									event.stopPropagation();
									void commit();
								}
							}}
						/>
						<div className="git-commit-row">
							<button
								type="button"
								className="git-commit-btn"
								disabled={message.trim() === "" || stagedCount === 0 || committing}
								onClick={() => void commit()}
							>
								{committing ? "Committing…" : "Commit"}
							</button>
							<span className="git-staged-count">{stagedCount} staged</span>
						</div>
						{commitError !== null ? (
							<p className="git-commit-error">{commitError}</p>
						) : null}
						{committed !== null ? (
							<p className="git-committed">Committed {committed}</p>
						) : null}
					</div>
					<div className="git-meta">
						<span className="git-counts">
							↑{status.ahead} ↓{status.behind}
						</span>
						<button
							type="button"
							className="git-refresh"
							onClick={() => void refresh()}
							disabled={loading}
						>
							Refresh
						</button>
					</div>
					{error !== null ? <p className="empty error">{error}</p> : null}
					<div className="tree-scroll">
						{staged.length > 0 ? (
							<>
								<div className="git-group-head">
									<span>Staged</span>
									<button
										type="button"
										className="git-stage-btn git-group-action"
										disabled={staged.some((entry) => busy.has(entry.path))}
										onClick={() =>
											void unstage(staged.map((entry) => entry.path))
										}
									>
										Unstage all
									</button>
								</div>
								<ul className="git-list">{staged.map(renderRow)}</ul>
							</>
						) : null}
						{changes.length > 0 ? (
							<>
								<div className="git-group-head">
									<span>Changes</span>
									<button
										type="button"
										className="git-discard-btn git-group-action"
										disabled={
											changes.some((entry) => busy.has(entry.path)) ||
											discarding
										}
										onClick={() =>
											setDiscardPaths(changes.map((entry) => entry.path))
										}
									>
										Discard all
									</button>
									<button
										type="button"
										className="git-stage-btn git-group-action"
										disabled={changes.some((entry) => busy.has(entry.path))}
										onClick={() =>
											void stage(changes.map((entry) => entry.path))
										}
									>
										Stage all
									</button>
								</div>
								{discardPaths !== null ? (
									<div
										className="git-discard-confirm"
										role="alertdialog"
										tabIndex={-1}
										onKeyDown={(event) => {
											if (event.key === "Escape") {
												event.preventDefault();
												setDiscardPaths(null);
											}
											if (event.key === "Enter") {
												event.preventDefault();
												void discard(discardPaths);
											}
										}}
									>
										<span>
											Discard {discardPaths.length}{" "}
											{discardPaths.length === 1 ? "file" : "files"}? This
											cannot be undone.
										</span>
										<button
											type="button"
											className="git-discard-btn"
											disabled={discarding}
											onClick={() => void discard(discardPaths)}
										>
											Discard
										</button>
										<button
											type="button"
											className="git-stage-btn"
											disabled={discarding}
											onClick={() => setDiscardPaths(null)}
										>
											Cancel
										</button>
									</div>
								) : null}
								<ul className="git-list">{changes.map(renderRow)}</ul>
							</>
						) : null}
						{staged.length === 0 && changes.length === 0 ? (
							<p className="empty">No changes</p>
						) : null}
					</div>
				</>
			) : tab === "blame" ? (
				<div className="tree-scroll">
					{activePath === null ? (
						<p className="empty">No file open</p>
					) : blameError !== null ? (
						<p className="empty error">{blameError}</p>
					) : blameLoading && !blameCache.has(activePath) ? (
						<p className="empty">Loading…</p>
					) : (blameCache.get(activePath) ?? []).length === 0 ? (
						<p className="empty">No blame for untracked files</p>
					) : (
						<ul className="git-list">
							{groupBlame(blameCache.get(activePath) ?? []).map(
								(group, groupIndex) => (
									<li
										key={`${group.hash}-${group.startLine}`}
										className="git-blame-group"
									>
										<button
											type="button"
											className="git-blame-header"
											onClick={() =>
												setCollapsed((current) => {
													const next = new Set(current);
													if (next.has(groupIndex))
														next.delete(groupIndex);
													else next.add(groupIndex);
													return next;
												})
											}
											title={group.subject}
										>
											<span className="git-commit-hash">
												{group.hash.slice(0, 7)}
											</span>
											<span className="git-row-name" title={group.subject}>
												{group.subject}
											</span>
											<span className="git-row-dir">
												{group.author} · {group.startLine}–{group.endLine}
											</span>
										</button>
										{collapsed.has(groupIndex) ? null : (
											<ul className="git-list">
												{group.lines.map((line) => (
													<li key={line.line} className="git-row">
														<button
															type="button"
															className="git-row-main"
															onClick={() => {
																if (activePath !== null) {
																	onNavigate(
																		activePath,
																		line.line,
																		0,
																	);
																}
															}}
														>
															<span className="git-row-name">
																{line.line}
															</span>
														</button>
													</li>
												))}
											</ul>
										)}
									</li>
								),
							)}
						</ul>
					)}
				</div>
			) : (
				<div className="tree-scroll">
					{historyError !== null ? <p className="empty error">{historyError}</p> : null}
					{historyLoading && history === null ? <p className="empty">Loading…</p> : null}
					{history !== null && history.length === 0 ? (
						<p className="empty">No commits yet</p>
					) : null}
					{history !== null && history.length > 0 ? (
						<ul className="git-list">
							{history.map((entry, index) => (
								<li
									key={entry.hash}
									className={`git-row${historySelected === index ? " git-row-selected" : ""}`}
								>
									<button
										type="button"
										className="git-row-main"
										onClick={() => {
											setHistorySelected(index);
											onCommitDiff(entry.hash);
											onDiff(null);
										}}
										title={entry.subject}
									>
										<span className="git-commit-hash">
											{entry.hash.slice(0, 7)}
										</span>
										<span className="git-row-name" title={entry.subject}>
											{entry.subject}
										</span>
										<span className="git-row-dir">
											{entry.author} · {relativeTime(entry.when)}
										</span>
									</button>
								</li>
							))}
						</ul>
					) : null}
					{history !== null &&
					history.length > 0 &&
					history.length < 500 &&
					historyLimit < 500 ? (
						<button
							type="button"
							className="git-refresh"
							disabled={historyLoading}
							onClick={() => void loadHistory(Math.min(historyLimit + 50, 500))}
						>
							Load more
						</button>
					) : null}
				</div>
			)}
		</aside>
	);
}
