import { useEffect, useState } from "react";
import { type GitFileDiff, gitFileDiff } from "@/project/api";
import { describeError } from "@/project/errors";

export type DiffViewProps = {
	root: string;
	path: string;
	onClose: () => void;
};

export default function DiffView({ root, path, onClose }: DiffViewProps) {
	const [diff, setDiff] = useState<GitFileDiff | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDiff(null);
		void (async () => {
			try {
				const next = await gitFileDiff(root, path);
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
	}, [root, path]);

	const lines = diff && !diff.binary ? diff.diff.split("\n") : [];

	return (
		<section className="git-diff" aria-label="Diff">
			<div className="git-diff-head">
				<span className="git-diff-title">{path}</span>
				<button type="button" className="git-diff-close" onClick={onClose}>
					close
				</button>
			</div>
			<div className="git-diff-body">
				{loading ? (
					<p className="git-diff-line">Loading…</p>
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
