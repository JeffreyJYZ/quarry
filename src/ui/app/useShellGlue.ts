import type { SessionSnapshot } from "@/ui/app/useSessionPersistence";
import type { BuildModel } from "@/ui/app/useBuild";
import type { EditorActions } from "@/ui/app/useEditorActions";
import type { useDebugSession } from "@/lib/debug/session";
import type { useDiagnosticsState } from "@/ui/app/useDiagnosticsState";
import type { useGitState } from "@/ui/app/useGitState";
import type { useOverlays } from "@/ui/app/useOverlays";
import type { usePanels } from "@/ui/app/usePanels";
import type { useRunControls } from "@/ui/app/useRunControls";
import type { useSaveBuffers } from "@/ui/app/useSaveBuffers";
import type { useSettings } from "@/ui/app/useSettings";
import type { useWorkspace } from "@/ui/app/useWorkspace";
import { buildCommands } from "@/ui/app/commands";
import { useClionKeymap } from "@/ui/app/useClionKeymap";
import { useKeybindings } from "@/ui/app/useKeybindings";
import { useSelectionKeybindings } from "@/ui/app/useSelectionKeybindings";
import { useSessionPersistence } from "@/ui/app/useSessionPersistence";
import { normalizePreferences } from "@/lib/settings/model";

export type GlueOptions = {
	workspace: ReturnType<typeof useWorkspace>;
	overlays: ReturnType<typeof useOverlays>;
	panels: ReturnType<typeof usePanels>;
	settings: ReturnType<typeof useSettings>;
	git: ReturnType<typeof useGitState>;
	runs: ReturnType<typeof useRunControls>;
	save: ReturnType<typeof useSaveBuffers>;
	build: BuildModel;
	editorActions: EditorActions;
	diagnostics: ReturnType<typeof useDiagnosticsState>;
	debug: ReturnType<typeof useDebugSession>;
	tests: ReturnType<typeof import("@/lib/tests/useTests").useTests>;
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	panelExpanded: boolean;
	snapshotRef: { current: SessionSnapshot };
};

/**
 * The cross-cutting wiring: accelerators, the command palette's list, and session persistence.
 *
 * Every hook above owns its own state; this one only reads across them, which is why it takes the
 * whole shell rather than growing its own.
 */
export function useShellGlue(options: GlueOptions) {
	const { workspace, overlays, panels, settings, git, runs, save, build, editorActions } =
		options;
	const { debug, root, activePath, cursor, panelExpanded, snapshotRef } = options;

	useKeybindings({
		root,
		activePath,
		cursor,
		panelExpanded,
		activePathRef: workspace.activePathRef,
		runToCursor: debug.runToCursor,
		saveActive: save.saveActive,
		saveAll: save.saveAll,
		formatActive: save.formatActive,
		setShortcutsOpen: overlays.setShortcutsOpen,
		setRailCollapsed: panels.setRailCollapsed,
		setPanelOpen: panels.setPanelOpen,
		setDebugOpen: panels.setDebugOpen,
		setGitOpen: panels.setGitOpen,
		setCommandPaletteOpen: overlays.setCommandPaletteOpen,
		setFileRevealToken: panels.setFileRevealToken,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
		setSearchOpen: overlays.setSearchOpen,
		setCallsCursor: overlays.setCallsCursor,
		setCallsOpen: overlays.setCallsOpen,
		setTypeHierarchyCursor: overlays.setTypeHierarchyCursor,
		setTypeHierarchyOpen: overlays.setTypeHierarchyOpen,
	});

	useSelectionKeybindings({
		root,
		activePath,
		cursor,
		activePathRef: workspace.activePathRef,
		runToCursor: debug.runToCursor,
		setFileRevealToken: panels.setFileRevealToken,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
		setCallsCursor: overlays.setCallsCursor,
		setCallsOpen: overlays.setCallsOpen,
		setTypeHierarchyCursor: overlays.setTypeHierarchyCursor,
		setTypeHierarchyOpen: overlays.setTypeHierarchyOpen,
	});

	useClionKeymap({
		root,
		activePath,
		cursor,
		running: runs.running,
		debug,
		run: () => void runs.run(),
		stop: () => void runs.stop(),
		toggleBreakpoint: debug.toggleBreakpoint,
		organizeImports: () => editorActions.organizeRef.current(),
		openRunPanel: runs.openPanel,
		setDebugOpen: panels.setDebugOpen,
		setGotoMode: overlays.setGotoMode,
		setGenerateOpen: overlays.setGenerateOpen,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
		setRailCollapsed: panels.setRailCollapsed,
		setTerminalOpen: panels.setTerminalOpen,
		setSettingsOpen: panels.setSettingsOpen,
		setSettingsTab: panels.setSettingsTab,
	});

	const commands = buildCommands({
		root,
		activePath,
		cursor,
		building: build.building,
		formatting: panels.formatting,
		running: runs.running,
		panelExpanded,
		openProject: () => void workspace.handleOpenProject(),
		build: () => void build.build(),
		run: () => void runs.run(),
		stop: () => void runs.stop(),
		save: () => void save.saveActive(),
		saveAll: () => void save.saveAll(),
		format: () => void save.formatActive(),
		runToCursor: (path, line) => debug.runToCursor(path, line),
		toggleDebug: () => panels.setDebugOpen((current) => !current),
		toggleGit: () => panels.setGitOpen((current) => !current),
		openSearch: () => overlays.setSearchOpen(true),
		toggleRail: () => panels.setRailCollapsed((current) => !current),
		toggleDock: () => panels.setPanelOpen(!panelExpanded),
		toggleTerminal: () =>
			panels.setTerminalOpen((current) => {
				if (!current) panels.setPanelOpen(true);
				return !current;
			}),
		revealFile: () => panels.setFileRevealToken((current) => current + 1),
		openQuick: () => overlays.setQuickOpenOpen(true),
		openShortcuts: () => overlays.setShortcutsOpen(true),
		refreshGit: () => git.setRefreshToken((current) => current + 1),
		toggleBlame: () => git.setBlameOn((current) => !current),
	});

	useSessionPersistence({
		snapshotRef,
		setters: {
			onPreferences: (next) => settings.setPreferences(normalizePreferences(next)),
			onRailCollapsed: panels.setRailCollapsed,
			onDebugOpen: panels.setDebugOpen,
			onGitOpen: panels.setGitOpen,
			onPanelOpen: panels.setPanelOpen,
			onRecentRoots: workspace.setRecentRoots,
			onRecentFiles: workspace.setRecentFiles,
			onNewProjectParent: panels.setNewProjectParent,
			onDockTab: panels.setDockTab,
			onRunConfigurations: (next) => runs.replaceConfigurations(next),
			onProject: workspace.setProject,
			onBuffers: workspace.setBuffers,
			onActivePath: workspace.setActivePath,
			onNotice: settings.onNotice,
		},
	});

	return { commands };
}
