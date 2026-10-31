import { useEffect, useRef, useState } from "react";
import "@/ui/git/git.css";
import { gitStageHunk, gitUnstageHunk } from "@/lib/git/api";
import { splitHunks } from "@/lib/git/hunks";
import { type CommitDiff, type GitFileDiff, gitCommitDiff, gitFileDiff } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type DiffViewProps = {
	root: string;
	path?: string | null;
	commit?: string | null;
	staged?: boolean;
	onClose: () => void;
	onNotice?: (message: string | null) => void;
};

export default function DiffView({
	root,
	path,
	commit,
	staged = false,
	onClose,
	onNotice,
}: DiffViewProps) {
	const isCommit = commit !== null && commit !== undefined;
	const key = isCommit ? (commit as string) : (path as string);
	const [diff, setDiff] = useState<GitFileDiff | CommitDiff | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [current, setCurrent] = useState(0);
	const hunkRefs = useRef<Array<HTMLDivElement | null>>([]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDiff(null);
		setCurrent(0);
		hunkRefs.current = [];
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

	const hunks =
		diff !== null && !diff.binary && diff.diff.trim() !== "" ? splitHunks(diff.diff) : [];

	useEffect(() => {
		if (hunks.length === 0) return;
		const node = hunkRefs.current[0];
		if (node !== null) node.scrollIntoView({ block: "start" });
	}, [hunks.length]);

	useEffect(() => {
		if (hunks.length === 0) return;
		const node = hunkRefs.current[current];
		if (node !== null) node.scrollIntoView({ block: "start" });
	}, [current, hunks.length]);

	const title = isCommit ? `commit ${key}` : key;

	function go(delta: number) {
		setCurrent((value) => {
			const next = Math.min(Math.max(value + delta, 0), hunks.length - 1);
			return next;
		});
	}

	return (
		<section className="git-diff" aria-label="Diff">
			<div className="git-diff-head">
				<span className="git-diff-title">{title}</span>
				{hunks.length > 1 ? (
					<div className="git-hunk-nav">
						<button
							type="button"
							className="git-stage-btn git-hunk-btn"
							disabled={current === 0}
							onClick={() => go(-1)}
						>
							Prev
						</button>
						<span className="git-hunk-counter">
							{current + 1}/{hunks.length}
						</span>
						<button
							type="button"
							className="git-stage-btn git-hunk-btn"
							disabled={current === hunks.length - 1}
							onClick={() => go(1)}
						>
							Next
						</button>
					</div>
				) : null}
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
					hunks.map((hunk, hunkIndex) => (
						<div
							key={hunk.id}
							ref={(node) => {
								hunkRefs.current[hunkIndex] = node;
							}}
							className={`git-diff-hunk${hunkIndex === current ? " git-diff-hunk-active" : ""}`}
						>
							<div className="git-diff-hunk-head">
								<span className="git-diff-line hunk">{hunk.header}</span>
								<button
									type="button"
									className="git-stage-btn git-hunk-btn"
									onClick={() =>
										void (
											staged
												? gitUnstageHunk(root, key, hunk.id)
												: gitStageHunk(root, key, hunk.id)
										)
											.then(() => onNotice?.(null))
											.catch((err) =>
												onNotice?.(
													`${staged ? "unstage" : "stage"} hunk failed: ${describeError(err)}`,
												),
											)
									}
								>
									{staged ? "unstage" : "stage"}
								</button>
							</div>
							{hunk.body.map((line, index) => {
								let cls = "git-diff-line";
								if (line.startsWith("+") && !line.startsWith("+++"))
									cls += " added";
								else if (line.startsWith("-") && !line.startsWith("---"))
									cls += " removed";
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: diff lines may repeat
									<div key={index} className={cls}>
										{line === "" ? " " : line}
									</div>
								);
							})}
						</div>
					))
				)}
			</div>
		</section>
	);
}
