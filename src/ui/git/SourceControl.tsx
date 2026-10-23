import { useState } from "react";
import { useBlame } from "@/lib/git/useBlame";
import { useBranches } from "@/lib/git/useBranches";
import { useChanges } from "@/lib/git/useChanges";
import { useCommit } from "@/lib/git/useCommit";
import { useDiscard } from "@/lib/git/useDiscard";
import { type GitPanelTab, useHistory } from "@/lib/git/useHistory";
import { usePanelKeys } from "@/lib/git/usePanelKeys";
import type { GitStatus } from "@/lib/project/api";
import BlameList from "./BlameList";
import BranchBar from "./BranchBar";
import ChangesPane from "./ChangesPane";
import HistoryList from "./HistoryList";
import StatusRail from "./StatusRail";
import Tabs from "./Tabs";

export type SourceControlProps = {
	root: string;
	refreshToken: number;
	status: GitStatus | null;
	activePath: string | null;
	saveToken?: number;
	onRefresh: () => Promise<void>;
	onOpenFile: (path: string) => void;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
	onNavigate: (path: string, line: number, character: number) => void;
	diffPath: string | null;
};

export default function SourceControl({
	root,
	refreshToken,
	status: statusProp,
	activePath,
	saveToken,
	onRefresh,
	onOpenFile,
	onDiff,
	onCommitDiff,
	onNavigate,
	diffPath,
}: SourceControlProps) {
	const status = statusProp;
	const stagedCount = status?.entries.filter((entry) => entry.staged).length ?? 0;
	const [tab, setTab] = useState<GitPanelTab>("changes");

	const changes = useChanges({ root, refreshToken, onRefresh, onCommitDiff });
	const history = useHistory({ root, tab, setTab, onDiff, onCommitDiff });
	const commit = useCommit({
		root,
		stagedCount,
		history: history.entries,
		historyLimit: history.limit,
		refresh: changes.refresh,
		loadHistory: history.load,
		onDiff,
		onCommitDiff,
	});
	const branches = useBranches({
		root,
		setError: changes.setError,
		onRefresh,
		loadHistory: history.load,
		historyLimit: history.limit,
		diffPath,
		onDiff,
		onCommitDiff,
	});
	const discard = useDiscard({
		root,
		diffPath,
		onDiff,
		refresh: changes.refresh,
		setBusy: changes.setBusy,
		setError: changes.setError,
	});
	const blame = useBlame({ root, tab, activePath, saveToken });

	usePanelKeys({
		tab,
		setTab,
		selected: changes.selected,
		status,
		stage: changes.stage,
		unstage: changes.unstage,
	});

	if (status === null && changes.error === null && changes.loading) {
		return <StatusRail message="Loading…" isError={false} />;
	}

	if (changes.error !== null && status === null) {
		return <StatusRail message={changes.error} isError={true} />;
	}

	if (status === null || status.branch === null) {
		return null;
	}

	const staged = status.entries.filter((entry) => entry.staged);
	const changeEntries = status.entries.filter((entry) => !entry.staged);
	const isRepo = (branches.branches ?? []).length > 0;

	return (
		<aside className="rail">
			<BranchBar
				branch={status.branch}
				isRepo={isRepo}
				open={branches.open}
				onToggle={() => branches.setOpen((current) => !current)}
				onClose={() => branches.setOpen(false)}
				filter={branches.filter}
				onFilter={branches.changeFilter}
				index={branches.index}
				setIndex={branches.setIndex}
				branches={branches.branches ?? []}
				switching={branches.switching}
				onSwitch={branches.switchBranch}
				error={changes.error}
				filterRef={branches.filterRef}
			/>
			{branches.switched !== null ? (
				<p className="git-committed">{branches.switched}</p>
			) : null}
			{branches.missingDiff !== null ? (
				<p className="git-committed">{branches.missingDiff}</p>
			) : null}
			<Tabs
				tab={tab}
				activePath={activePath}
				onChanges={() => {
					setTab("changes");
					onCommitDiff(null);
				}}
				onHistory={() => setTab("history")}
				onBlame={() => setTab("blame")}
			/>
			{tab === "changes" ? (
				<ChangesPane
					status={status}
					stagedCount={stagedCount}
					staged={staged}
					changeEntries={changeEntries}
					changes={changes}
					commit={commit}
					discard={discard}
					onOpenFile={onOpenFile}
					onDiff={onDiff}
					onClearMissingDiff={branches.clearMissingDiff}
				/>
			) : tab === "blame" ? (
				<BlameList
					activePath={activePath}
					lines={activePath !== null ? (blame.cache.get(activePath) ?? []) : []}
					cached={activePath !== null && blame.cache.has(activePath)}
					loading={blame.loading}
					error={blame.error}
					copied={changes.copied}
					collapsed={blame.collapsed}
					onToggle={blame.toggleGroup}
					onCopy={(text) => void changes.copyText(text)}
					onNavigate={onNavigate}
				/>
			) : (
				<HistoryList
					entries={history.entries}
					error={history.error}
					copied={changes.copied}
					loading={history.loading}
					selected={history.selected}
					limit={history.limit}
					onSelect={(index, hash) => {
						history.select(index);
						onCommitDiff(hash);
						onDiff(null);
					}}
					onCopy={(text) => void changes.copyText(text)}
					onLoadMore={(limit) => void history.load(limit)}
				/>
			)}
		</aside>
	);
}
