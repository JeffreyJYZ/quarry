import TopBar from "@/ui/app/TopBar";
import type { ShellModel } from "@/ui/app/useShell";

/** The title bar, wired to the shell. */
export default function AppTopBar({ model }: { model: ShellModel }) {
	const { workspace, build, settings, runs, panels, save, git } = model;
	return (
		<TopBar
			root={model.root}
			project={workspace.project}
			opening={workspace.opening}
			onOpenProject={() => void workspace.handleOpenProject()}
			recentRoots={workspace.recentRoots}
			onOpenRoot={(nextRoot) => void workspace.openRoot(nextRoot)}
			buildSplitRef={build.splitRef}
			buildChevronRef={build.chevronRef}
			building={build.building}
			buildProfile={settings.buildProfile}
			buildMenuOpen={build.menuOpen}
			onToggleBuildMenu={() => build.setMenuOpen((current) => !current)}
			onOpenBuildMenu={() => build.setMenuOpen(true)}
			onPickBuildProfile={(profile) => {
				settings.applyBuildProfile(profile);
				build.setMenuOpen(false);
				build.chevronRef.current?.focus();
			}}
			onBuild={() => void build.build()}
			runId={runs.running}
			onRun={() => void runs.run()}
			onStop={() => void runs.stop()}
			formatting={panels.formatting}
			activePath={model.activePath}
			onFormat={() => void save.formatActive()}
			gitOpen={panels.gitOpen}
			onToggleGit={() => panels.setGitOpen((current) => !current)}
			debugOpen={panels.debugOpen}
			onToggleDebug={() => panels.setDebugOpen((current) => !current)}
			panelExpanded={model.panelExpanded}
			dockTab={panels.dockTab}
			onShowTests={() => {
				panels.setDockTab("tests");
				panels.setPanelOpen(true);
			}}
			blameOn={git.blameOn}
			onToggleBlame={() => git.setBlameOn((current) => !current)}
			terminalOpen={panels.terminalOpen}
			onToggleTerminal={() => {
				panels.setTerminalOpen((current) => !current);
				if (!panels.terminalOpen) panels.setPanelOpen(true);
			}}
			onNewProject={() => panels.setNewProjectOpen(true)}
		/>
	);
}
