import { groupBlame } from "@/lib/git/blame";
import type { BlameLine } from "@/lib/project/api";
import { CopyHashButton } from "./rows";

type BlameListProps = {
	activePath: string | null;
	lines: BlameLine[];
	cached: boolean;
	loading: boolean;
	error: string | null;
	copied: string | null;
	collapsed: Set<number>;
	onToggle: (index: number) => void;
	onCopy: (text: string) => void;
	onNavigate: (path: string, line: number, character: number) => void;
};

/** The per-file blame tab: one collapsible group per commit. */
export default function BlameList({
	activePath,
	lines,
	cached,
	loading,
	error,
	copied,
	collapsed,
	onToggle,
	onCopy,
	onNavigate,
}: BlameListProps) {
	return (
		<div className="tree-scroll">
			{activePath === null ? (
				<p className="empty">No file open</p>
			) : error !== null ? (
				<p className="empty error">{error}</p>
			) : copied !== null ? (
				<p className="git-committed">Copied {copied}</p>
			) : loading && !cached ? (
				<p className="empty">Loading…</p>
			) : lines.length === 0 ? (
				<p className="empty">No blame for untracked files</p>
			) : (
				<ul className="git-list">
					{groupBlame(lines).map((group, groupIndex) => (
						<li key={`${group.hash}-${group.startLine}`} className="git-blame-group">
							<CopyHashButton hash={group.hash} onCopy={onCopy} />
							<button
								type="button"
								className="git-blame-header"
								onClick={() => onToggle(groupIndex)}
								title={group.subject}
							>
								<span className="git-commit-hash">{group.hash.slice(0, 7)}</span>
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
														onNavigate(activePath, line.line, 0);
													}
												}}
											>
												<span className="git-row-name">{line.line}</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
