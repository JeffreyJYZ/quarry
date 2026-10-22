import { useCallback, useEffect, useState } from "react";
import { type GitStatus, type GitStatusEntry, gitStatus } from "@/project/api";
import { describeError } from "@/project/errors";

export type SourceControlProps = {
	root: string;
	refreshToken: number;
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
	onOpenFile,
	onDiff,
}: SourceControlProps) {
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const next = await gitStatus(root);
			setStatus(next);
			setError(null);
		} catch (err) {
			setError(describeError(err));
			setStatus(null);
		} finally {
			setLoading(false);
		}
	}, [root]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an explicit refresh trigger
	useEffect(() => {
		void refresh();
	}, [refreshToken]);

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

	if (error !== null) {
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

	const renderRow = (entry: GitStatusEntry) => (
		<li key={`${entry.staged ? "s" : "c"}:${entry.path}`} className="git-row">
			<button
				type="button"
				className="git-row-main"
				onClick={() => onOpenFile(entry.path)}
				title={entry.path}
			>
				<span className={`git-status-letter ${STATUS_CLASS[entry.status]}`}>
					{STATUS_LETTER[entry.status]}
				</span>
				<span className="git-row-name">{nameOf(entry.path)}</span>
				<span className="git-row-dir">{dirOf(entry.path)}</span>
			</button>
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

	return (
		<aside className="rail">
			<div className="rail-head">
				<span className="label">Source control</span>
				<span className="git-branch">{status.branch}</span>
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
			<div className="tree-scroll">
				{staged.length > 0 ? (
					<>
						<div className="git-group-head">Staged</div>
						<ul className="git-list">{staged.map(renderRow)}</ul>
					</>
				) : null}
				{changes.length > 0 ? (
					<>
						<div className="git-group-head">Changes</div>
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
