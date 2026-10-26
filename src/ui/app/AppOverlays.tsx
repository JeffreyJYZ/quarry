import type { GenerateItem } from "@/lib/generate/model";
import type { GitStatus, Location, ProjectInfo } from "@/lib/project/api";
import type { Preferences, ProjectSettings } from "@/lib/settings/model";
import type { GotoMode } from "@/ui/goto/gotoModel";
import DiffView from "@/ui/git/DiffView";
import Goto from "@/ui/goto/Goto";
import Generate from "@/ui/generate/Generate";
import NewProject from "@/ui/projects/NewProject";
import RefsPanel from "@/ui/components/RefsPanel";
import SettingsPage from "@/ui/settings/SettingsPage";
import StatusBar from "@/ui/components/StatusBar";

export type OverlaysProps = {
	root: string | null;
	project: ProjectInfo | null;
	activePath: string | null;
	counts: { errors: number; warnings: number };
	gitStatus: GitStatus | null;
	missingTools: number;
	saveError: string | null;
	caret: { line: number; column: number } | null;
	language: string | null;
	tabSize: number;
	server: string | null;
	onOpenSettings: () => void;

	railCollapsed: boolean;
	terminalOpen: boolean;
	panelExpanded: boolean;
	gitOpen: boolean;
	debugOpen: boolean;
	building: boolean;
	running: boolean;
	onToggleRail: () => void;
	onToggleTerminal: () => void;
	onTogglePanel: () => void;
	onToggleGit: () => void;
	onToggleDebug: () => void;
	onBuild: () => void;
	onRun: () => void;
	onStop: () => void;

	references: Location[];
	refsOpen: boolean;
	onCloseRefs: () => void;
	onNavigate: (path: string, line: number, character: number) => void;

	gitDiffPath: string | null;
	onCloseGitDiff: () => void;
	gitCommitDiffHash: string | null;
	onCloseCommitDiff: () => void;

	settingsOpen: boolean;
	settingsTab: "user" | "project";
	preferences: Preferences;
	projectSettings: ProjectSettings;
	onCloseSettings: () => void;
	onPreferencesChange: (next: Preferences) => void;
	onProjectSettingsChange: (next: ProjectSettings | null) => void;
	onResetPanels: () => void;

	gotoMode: GotoMode | null;
	gotoRecent: string[];
	onCloseGoto: () => void;

	generateOpen: boolean;
	generateItems: GenerateItem[];
	onPickGenerate: (item: GenerateItem) => void;
	onCloseGenerate: () => void;

	newProjectOpen: boolean;
	newProjectParent: string;
	onNewProjectParentChange: (parent: string) => void;
	onCloseNewProject: () => void;
	onProjectCreated: (root: string) => void;
};

/**
 * Everything layered over the workbench: side panels, the status bar and the modal dialogs.
 *
 * Splitting them out keeps `App` about state and wiring; these are presentation only.
 */
export default function AppOverlays(props: OverlaysProps) {
	return (
		<>
			{props.refsOpen ? (
				<RefsPanel
					locations={props.references}
					onNavigate={props.onNavigate}
					onClose={props.onCloseRefs}
				/>
			) : null}
			{props.gitDiffPath !== null && props.root !== null ? (
				<DiffView
					root={props.root}
					path={props.gitDiffPath}
					onClose={props.onCloseGitDiff}
				/>
			) : props.gitCommitDiffHash !== null && props.root !== null ? (
				<DiffView
					root={props.root}
					commit={props.gitCommitDiffHash}
					onClose={props.onCloseCommitDiff}
				/>
			) : null}
			<StatusBar
				project={props.project}
				git={props.gitStatus}
				errors={props.counts.errors}
				warnings={props.counts.warnings}
				missingTools={props.missingTools}
				saveError={props.saveError}
				caret={props.caret}
				language={props.language}
				tabSize={props.tabSize}
				server={props.server}
				onOpenSettings={props.onOpenSettings}
				railCollapsed={props.railCollapsed}
				terminalOpen={props.terminalOpen}
				panelExpanded={props.panelExpanded}
				gitOpen={props.gitOpen}
				debugOpen={props.debugOpen}
				building={props.building}
				running={props.running}
				onToggleRail={props.onToggleRail}
				onToggleTerminal={props.onToggleTerminal}
				onTogglePanel={props.onTogglePanel}
				onToggleGit={props.onToggleGit}
				onToggleDebug={props.onToggleDebug}
				onBuild={props.onBuild}
				onRun={props.onRun}
				onStop={props.onStop}
			/>
			{props.settingsOpen ? (
				<SettingsPage
					open
					user={props.preferences}
					project={props.projectSettings}
					projectRoot={props.root}
					onClose={props.onCloseSettings}
					onUserChange={props.onPreferencesChange}
					onProjectChange={props.onProjectSettingsChange}
					onResetPanels={props.onResetPanels}
					initialTab={props.settingsTab}
				/>
			) : null}
			{props.gotoMode !== null && props.root !== null ? (
				<Goto
					mode={props.gotoMode}
					root={props.root}
					path={props.activePath}
					recent={props.gotoRecent}
					onOpen={props.onNavigate}
					onClose={props.onCloseGoto}
				/>
			) : null}
			{props.generateOpen ? (
				<Generate
					items={props.generateItems}
					onPick={props.onPickGenerate}
					onClose={props.onCloseGenerate}
				/>
			) : null}
			<NewProject
				open={props.newProjectOpen}
				initialParent={props.newProjectParent}
				onParentChange={props.onNewProjectParentChange}
				onClose={props.onCloseNewProject}
				onCreated={props.onProjectCreated}
			/>
		</>
	);
}
