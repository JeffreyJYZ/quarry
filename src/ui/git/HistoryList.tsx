import type { GitCommitEntry } from "@/lib/project/api";
import { HISTORY_LIMIT, HISTORY_PAGE_SIZE, SHORT_HASH_LEN } from "@/lib/consts/git";
import { relativeTime } from "./labels";
import { CopyHashButton } from "./rows";

type HistoryListProps = {
	entries: GitCommitEntry[] | null;
	error: string | null;
	copied: string | null;
	loading: boolean;
	selected: number | null;
	limit: number;
	onSelect: (index: number, hash: string) => void;
	onCopy: (text: string) => void;
	onLoadMore: (limit: number) => void;
};

/** The history tab: commit rows plus the "Load more" pager. */
export default function HistoryList({
	entries,
	error,
	copied,
	loading,
	selected,
	limit,
	onSelect,
	onCopy,
	onLoadMore,
}: HistoryListProps) {
	return (
		<div className="tree-scroll">
			{error !== null ? (
				<p className="empty error">{error}</p>
			) : copied !== null ? (
				<p className="git-committed">Copied {copied}</p>
			) : null}
			{loading && entries === null ? <p className="empty">Loading…</p> : null}
			{entries !== null && entries.length === 0 ? (
				<p className="empty">No commits yet</p>
			) : null}
			{entries !== null && entries.length > 0 ? (
				<ul className="git-list">
					{entries.map((entry, index) => (
						<li
							key={entry.hash}
							className={`git-row${selected === index ? " git-row-selected" : ""}`}
						>
							<CopyHashButton hash={entry.hash} onCopy={onCopy} />
							<button
								type="button"
								className="git-row-main"
								onClick={() => onSelect(index, entry.hash)}
								title={entry.subject}
							>
								<span className="git-commit-hash">
									{entry.hash.slice(0, SHORT_HASH_LEN)}
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
			{entries !== null &&
			entries.length > 0 &&
			entries.length < HISTORY_LIMIT &&
			limit < HISTORY_LIMIT ? (
				<button
					type="button"
					className="git-refresh"
					disabled={loading}
					onClick={() => onLoadMore(Math.min(limit + HISTORY_PAGE_SIZE, HISTORY_LIMIT))}
				>
					Load more
				</button>
			) : null}
		</div>
	);
}
