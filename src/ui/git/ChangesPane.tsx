import type { GitStatus, GitStatusEntry } from "@/lib/project/api";
import type { useChanges } from "@/lib/git/useChanges";
import type { useCommit } from "@/lib/git/useCommit";
import type { useDiscard } from "@/lib/git/useDiscard";
import ChangesList from "./ChangesList";
import CommitBox from "./CommitBox";

type ChangesPaneProps = {
	status: GitStatus;
	stagedCount: number;
	staged: GitStatusEntry[];
	changeEntries: GitStatusEntry[];
	changes: ReturnType<typeof useChanges>;
	commit: ReturnType<typeof useCommit>;
	discard: ReturnType<typeof useDiscard>;
	onOpenFile: (path: string) => void;
	onDiff: (path: string | null) => void;
	onClearMissingDiff: () => void;
};

/** The Changes tab: commit box, ahead/behind line, status line and the file groups. */
export default function ChangesPane({
	status,
	stagedCount,
	staged,
	changeEntries,
	changes,
	commit,
	discard,
	onOpenFile,
	onDiff,
	onClearMissingDiff,
}: ChangesPaneProps) {
	return (
		<>
			<CommitBox
				message={commit.message}
				onMessage={commit.changeMessage}
				onRecall={commit.recall}
				commitError={commit.commitError}
				committed={commit.committed}
				committing={commit.committing}
				stagedCount={stagedCount}
				commit={() => void commit.commit()}
				amendMode={commit.amendMode}
				amendMessage={commit.amendMessage}
				amendError={commit.amendError}
				amending={commit.amending}
				onBeginAmend={commit.beginAmend}
				onAmendMessage={commit.changeAmendMessage}
				amend={() => void commit.amend()}
				onCancelAmend={commit.cancelAmend}
			/>
			<div className="git-meta">
				<span className="git-counts">
					↑{status.ahead} ↓{status.behind}
				</span>
				<button
					type="button"
					className="git-refresh"
					onClick={() => void changes.refresh()}
					disabled={changes.loading}
				>
					Refresh
				</button>
			</div>
			{changes.error !== null ? (
				<p className="empty error">{changes.error}</p>
			) : changes.copied !== null ? (
				<p className="git-committed">Copied {changes.copied}</p>
			) : null}
			<ChangesList
				staged={staged}
				changes={changeEntries}
				busy={changes.busy}
				selected={changes.selected}
				discarding={discard.discarding}
				discardPaths={discard.paths}
				onOpen={(path) => {
					changes.setSelected(path);
					onOpenFile(path);
				}}
				onStage={(paths) => void changes.stage(paths)}
				onUnstage={(paths) => void changes.unstage(paths)}
				onSelectDiscard={discard.setPaths}
				onDiscard={(paths) => void discard.discard(paths)}
				onCopy={(path) => void changes.copyText(path)}
				onDiff={(path) => {
					onClearMissingDiff();
					onDiff(path);
				}}
			/>
		</>
	);
}
