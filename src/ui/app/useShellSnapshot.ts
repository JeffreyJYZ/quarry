import { useSnapshotRef } from "@/ui/app/useSnapshotRef";
import type { useWorkspace } from "@/ui/app/useWorkspace";
import type { usePanels } from "@/ui/app/usePanels";
import type { useSettings } from "@/ui/app/useSettings";
import type { useRunControls } from "@/ui/app/useRunControls";

type Workspace = ReturnType<typeof useWorkspace>;
type Panels = ReturnType<typeof usePanels>;
type Settings = ReturnType<typeof useSettings>;
type Runs = ReturnType<typeof useRunControls>;

export function useShellSnapshot(args: {
	workspace: Workspace;
	panels: Panels;
	activePath: string | null;
	runs: Runs;
	settings: Settings;
}) {
	const { workspace, panels, activePath, runs, settings } = args;
	return useSnapshotRef(() => ({
		project: workspace.project,
		buffers: workspace.buffers,
		activePath,
		railCollapsed: panels.railCollapsed,
		gitOpen: panels.gitOpen,
		panelOpen: panels.panelOpen,
		dockTab: panels.dockTab,
		runConfigurations: runs.configurations,
		preferences: settings.preferences,
		recentFiles: workspace.recentFiles,
		newProjectParent: panels.newProjectParent,
	}));
}
