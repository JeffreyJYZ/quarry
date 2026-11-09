import type { GitPanelTab } from "@/lib/git/useHistory";

type TabsProps = {
	tab: GitPanelTab;
	activePath: string | null;
	onChanges: () => void;
	onHistory: () => void;
	onBlame: () => void;
};

/** The Changes / History / Blame strip; Blame only appears with a file open. */
export default function Tabs({ tab, activePath, onChanges, onHistory, onBlame }: TabsProps) {
	return (
		<div className="git-tabs" role="tablist" aria-label="Source control">
			<button
				type="button"
				role="tab"
				aria-selected={tab === "changes"}
				className={`git-tab${tab === "changes" ? " git-tab-active" : ""}`}
				onClick={onChanges}
			>
				Changes
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === "history"}
				className={`git-tab${tab === "history" ? " git-tab-active" : ""}`}
				onClick={onHistory}
			>
				History
			</button>
			{activePath !== null ? (
				<button
					type="button"
					role="tab"
					aria-selected={tab === "blame"}
					className={`git-tab${tab === "blame" ? " git-tab-active" : ""}`}
					onClick={onBlame}
				>
					Blame
				</button>
			) : null}
		</div>
	);
}
