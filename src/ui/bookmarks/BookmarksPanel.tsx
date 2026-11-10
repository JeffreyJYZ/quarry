import type { BookmarkGroup } from "@/lib/bookmarks/model";

export type BookmarksPanelProps = {
	groups: BookmarkGroup[];
	/** The dock has no project yet, so there is nothing to list and nothing to clear. */
	onJump: (path: string, line: number) => void;
	onRemove: (path: string, line: number) => void;
	onClear: () => void;
};

/** The Bookmarks tool window: one group per file, one row per line, in the dock's shared body. */
export default function BookmarksPanel({ groups, onJump, onRemove, onClear }: BookmarksPanelProps) {
	const empty = groups.length === 0;
	return (
		<section className="bookmarks-panel" aria-label="Bookmarks">
			<div className="bookmarks-tools">
				<span className="bookmarks-count">
					{empty ? "no bookmarks" : `${groups.length} files`}
				</span>
				{empty ? null : (
					<button type="button" className="bookmarks-clear" onClick={onClear}>
						clear all
					</button>
				)}
			</div>
			{empty ? (
				<div className="bookmarks-empty">
					<p className="bookmarks-hint">No bookmarks in this project.</p>
					<p className="bookmarks-hint bookmarks-hint-quiet">
						Place the caret on a line and press Cmd+Alt+K to mark it.
					</p>
				</div>
			) : (
				<ul className="bookmarks-list">
					{groups.map((group) => (
						<li key={group.path} className="bookmarks-group">
							<span className="bookmarks-file" title={group.path}>
								{group.label}
							</span>
							<ul className="bookmarks-rows">
								{group.rows.map((row) => (
									<li key={row.line} className="bookmarks-row">
										<button
											type="button"
											className="bookmarks-jump"
											onClick={() => onJump(row.path, row.line)}
										>
											<span className="bookmarks-pos">{row.line}</span>
											<span className="bookmarks-text">
												{row.text.trim() === "" ? " " : row.text.trim()}
											</span>
										</button>
										<button
											type="button"
											className="bookmarks-remove"
											aria-label={`Remove bookmark at ${group.label}:${row.line}`}
											title="Remove bookmark"
											onClick={() => onRemove(row.path, row.line)}
										>
											×
										</button>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
