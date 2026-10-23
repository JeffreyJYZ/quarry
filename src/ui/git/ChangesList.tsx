import type { GitStatusEntry } from "@/lib/project/api";
import { ChangeRow } from "./rows";

type ChangesListProps = {
	staged: GitStatusEntry[];
	changes: GitStatusEntry[];
	busy: Set<string>;
	selected: string | null;
	discarding: boolean;
	discardPaths: string[] | null;
	onOpen: (path: string) => void;
	onStage: (paths: string[]) => void;
	onUnstage: (paths: string[]) => void;
	onSelectDiscard: (paths: string[] | null) => void;
	onDiscard: (paths: string[]) => void;
	onCopy: (path: string) => void;
	onDiff: (path: string) => void;
};

/** The staged and changed groups, their bulk actions and the discard confirmation. */
export default function ChangesList({
	staged,
	changes,
	busy,
	selected,
	discarding,
	discardPaths,
	onOpen,
	onStage,
	onUnstage,
	onSelectDiscard,
	onDiscard,
	onCopy,
	onDiff,
}: ChangesListProps) {
	const row = (entry: GitStatusEntry) => (
		<ChangeRow
			key={`${entry.staged ? "s" : "c"}:${entry.path}`}
			entry={entry}
			busy={busy}
			selected={selected === entry.path}
			discarding={discarding}
			onOpen={onOpen}
			onStage={(path) => onStage([path])}
			onUnstage={(path) => onUnstage([path])}
			onDiscard={(path) => onSelectDiscard([path])}
			onCopy={onCopy}
			onDiff={onDiff}
		/>
	);

	return (
		<div className="tree-scroll">
			{staged.length > 0 ? (
				<>
					<div className="git-group-head">
						<span>Staged</span>
						<button
							type="button"
							className="git-stage-btn git-group-action"
							disabled={staged.some((entry) => busy.has(entry.path))}
							onClick={() => onUnstage(staged.map((entry) => entry.path))}
						>
							Unstage all ({staged.length})
						</button>
					</div>
					<ul className="git-list">{staged.map(row)}</ul>
				</>
			) : null}
			{changes.length > 0 ? (
				<>
					<div className="git-group-head">
						<span>Changes</span>
						<button
							type="button"
							className="git-discard-btn git-group-action"
							disabled={changes.some((entry) => busy.has(entry.path)) || discarding}
							onClick={() => onSelectDiscard(changes.map((entry) => entry.path))}
						>
							Discard all
						</button>
						<button
							type="button"
							className="git-stage-btn git-group-action"
							disabled={changes.some((entry) => busy.has(entry.path))}
							onClick={() => onStage(changes.map((entry) => entry.path))}
						>
							Stage all ({changes.length})
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
									onSelectDiscard(null);
								}
								if (event.key === "Enter") {
									event.preventDefault();
									onDiscard(discardPaths);
								}
							}}
						>
							<span>
								Discard {discardPaths.length}{" "}
								{discardPaths.length === 1 ? "file" : "files"}? This cannot be
								undone.
							</span>
							<button
								type="button"
								className="git-discard-btn"
								disabled={discarding}
								onClick={() => onDiscard(discardPaths)}
							>
								Discard
							</button>
							<button
								type="button"
								className="git-stage-btn"
								disabled={discarding}
								onClick={() => onSelectDiscard(null)}
							>
								Cancel
							</button>
						</div>
					) : null}
					<ul className="git-list">{changes.map(row)}</ul>
				</>
			) : null}
			{staged.length === 0 && changes.length === 0 ? (
				<p className="empty">No changes</p>
			) : null}
		</div>
	);
}
