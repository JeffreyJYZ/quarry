import type { GenerateItem } from "@/lib/generate/model";
import type { GitStatus, Location, ProjectInfo } from "@/lib/project/api";
import type { Preferences, ProjectSettings } from "@/lib/settings/model";
import type { StatusChip } from "@/lib/status/model";
import type { GotoMode } from "@/ui/goto/gotoModel";
import { Suspense } from "react";
import AppStatusBar from "@/ui/app/AppStatusBar";
import * as Lazy from "@/ui/app/lazyOverlays";

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
	/** The one status chip decision: language server name, or the work that is in flight. */
	status: StatusChip | null;
	onOpenSettings: () => void;

	railCollapsed: boolean;
	terminalOpen: boolean;
	panelExpanded: boolean;
	gitOpen: boolean;
	debuggerActive: boolean;
	building: boolean;
	/** Stop was sent for the build in flight and the backend has not reported it finished yet. */
	stopping: boolean;
	running: boolean;
	onToggleRail: () => void;
	onToggleTerminal: () => void;
	onTogglePanel: () => void;
	onToggleGit: () => void;
	onShowDebugger: () => void;
	onBuild: () => void;
	onStopBuild: () => void;
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
	lineOpen: boolean;
	lineTotal: number;
	onGoLine: (line: number) => void;
	onCloseLine: () => void;
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
				<Suspense fallback={null}>
					<Lazy.RefsPanel
						locations={props.references}
						onNavigate={props.onNavigate}
						onClose={props.onCloseRefs}
					/>
				</Suspense>
			) : null}
			{props.gitDiffPath !== null && props.root !== null ? (
				<Suspense fallback={null}>
					<Lazy.DiffView
						root={props.root}
						path={props.gitDiffPath}
						onClose={props.onCloseGitDiff}
					/>
				</Suspense>
			) : props.gitCommitDiffHash !== null && props.root !== null ? (
				<Suspense fallback={null}>
					<Lazy.DiffView
						root={props.root}
						commit={props.gitCommitDiffHash}
						onClose={props.onCloseCommitDiff}
					/>
				</Suspense>
			) : null}
			<AppStatusBar {...props} />
			{props.settingsOpen ? (
				<Suspense fallback={null}>
					<Lazy.SettingsPage
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
				</Suspense>
			) : null}
			{props.gotoMode !== null && props.root !== null ? (
				<Suspense fallback={null}>
					<Lazy.Goto
						mode={props.gotoMode}
						root={props.root}
						path={props.activePath}
						recent={props.gotoRecent}
						onOpen={props.onNavigate}
						onClose={props.onCloseGoto}
					/>
				</Suspense>
			) : null}
			{props.lineOpen ? (
				<Suspense fallback={null}>
					<Lazy.LinePrompt
						total={props.lineTotal}
						onGo={props.onGoLine}
						onClose={props.onCloseLine}
					/>
				</Suspense>
			) : null}
			{props.generateOpen ? (
				<Suspense fallback={null}>
					<Lazy.Generate
						items={props.generateItems}
						onPick={props.onPickGenerate}
						onClose={props.onCloseGenerate}
					/>
				</Suspense>
			) : null}
			<Suspense fallback={null}>
				<Lazy.NewProject
					open={props.newProjectOpen}
					initialParent={props.newProjectParent}
					onParentChange={props.onNewProjectParentChange}
					onClose={props.onCloseNewProject}
					onCreated={props.onProjectCreated}
				/>
			</Suspense>
		</>
	);
}
