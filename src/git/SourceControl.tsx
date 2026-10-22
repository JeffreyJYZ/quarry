import { useCallback, useEffect, useRef, useState } from "react";
import {
	type GitStatus,
	type GitStatusEntry,
	gitCommit,
	gitStage,
	gitUnstage,
} from "@/project/api";
import { describeError } from "@/project/errors";

export type SourceControlProps = {
	root: string;
	refreshToken: number;
	status: GitStatus | null;
	onRefresh: () => Promise<void>;
	onOpenFile: (path: string) => void;
	onDiff: (path: string) => void;
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

export default function SourceControl({
	root,
	refreshToken,
	status: statusProp,
	onRefresh,
	onOpenFile,
	onDiff,
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
	}, [onRefresh]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an explicit refresh trigger
	useEffect(() => {
		void refresh();
	}, [refreshToken]);

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
		} catch (err) {
			setCommitError(describeError(err));
		} finally {
			setCommitting(false);
		}
	}, [message, stagedCount, committing, root, refresh]);

	useEffect(() => {
		return () => {
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
		};
	}, []);

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
					<button
						type="button"
						className="git-stage-btn"
						disabled={isBusy}
						onClick={() => void stage([entry.path])}
						aria-label={`stage ${entry.path}`}
					>
						Stage
					</button>
				)}
				<button
					type="button"
					className="git-diff-btn"
					onClick={() => onDiff(entry.path)}
					aria-label={`diff ${entry.path}`}
				>
					diff
				</button>
			</li>
		);
	};

	return (
		<aside className="rail">
			<div className="rail-head">
				<span className="label">Source control</span>
				<span className="git-branch">{status.branch}</span>
			</div>
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
				{commitError !== null ? <p className="git-commit-error">{commitError}</p> : null}
				{committed !== null ? <p className="git-committed">Committed {committed}</p> : null}
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
								onClick={() => void unstage(staged.map((entry) => entry.path))}
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
								className="git-stage-btn git-group-action"
								disabled={changes.some((entry) => busy.has(entry.path))}
								onClick={() => void stage(changes.map((entry) => entry.path))}
							>
								Stage all
							</button>
						</div>
						<ul className="git-list">{changes.map(renderRow)}</ul>
					</>
				) : null}
				{staged.length === 0 && changes.length === 0 ? (
					<p className="empty">No changes</p>
				) : null}
			</div>
		</aside>
	);
}
