import { useEffect, useState } from "react";
import { type CommitDiff, type GitFileDiff, gitCommitDiff, gitFileDiff } from "@/project/api";
import { describeError } from "@/project/errors";

export type DiffViewProps = {
	root: string;
	path?: string | null;
	commit?: string | null;
	onClose: () => void;
};

export default function DiffView({ root, path, commit, onClose }: DiffViewProps) {
	const isCommit = commit !== null && commit !== undefined;
	const key = isCommit ? (commit as string) : (path as string);
	const [diff, setDiff] = useState<GitFileDiff | CommitDiff | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDiff(null);
		void (async () => {
			try {
				const next = isCommit
					? await gitCommitDiff(root, key)
					: await gitFileDiff(root, key);
				if (cancelled) return;
				setDiff(next);
			} catch (err) {
				if (cancelled) return;
				setError(describeError(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [root, key, isCommit]);

	const lines = diff !== null && !diff.binary ? diff.diff.split("\n") : [];
	const title = isCommit ? `commit ${key}` : key;

	return (
		<section className="git-diff" aria-label="Diff">
			<div className="git-diff-head">
				<span className="git-diff-title">{title}</span>
				<button type="button" className="git-diff-close" onClick={onClose}>
					{isCommit ? "Back to changes" : "close"}
				</button>
			</div>
			<div className="git-diff-body">
				{loading ? (
					<p className="git-diff-line">{isCommit ? `Loading ${key}…` : "Loading…"}</p>
				) : error !== null ? (
					<p className="git-diff-line error">{error}</p>
				) : diff === null ? (
					<p className="git-diff-line">No diff</p>
				) : diff.binary ? (
					<p className="git-diff-line">Binary file</p>
				) : diff.diff.trim() === "" ? (
					<p className="git-diff-line">No changes</p>
				) : (
					lines.map((line, index) => {
						let cls = "git-diff-line";
						if (line.startsWith("+") && !line.startsWith("+++")) cls += " added";
						else if (line.startsWith("-") && !line.startsWith("---")) cls += " removed";
						else if (line.startsWith("@@")) cls += " hunk";
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: diff lines may repeat
							<div key={index} className={cls}>
								{line === "" ? " " : line}
							</div>
						);
					})
				)}
			</div>
		</section>
	);
}
