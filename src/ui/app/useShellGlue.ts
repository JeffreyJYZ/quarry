import { useCallback, useRef } from "react";
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
import { shellCommands } from "@/ui/app/shellCommands";
import { makeLspCommandHandlers } from "@/ui/app/lspCommandHandlers";
import { useRunDebug } from "@/ui/app/useRunDebug";
import { useClionKeymap } from "@/ui/app/useClionKeymap";
import { useKeybindings } from "@/ui/app/useKeybindings";
import { useShellEffects } from "@/ui/app/useShellEffects";
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
	onNotice?: (message: string | null) => void;
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
	const { debug, root, activePath, cursor, panelExpanded, snapshotRef, onNotice } = options;

	useKeybindings({
		root,
		activePath,
		cursor,
		panelExpanded,
		activePathRef: workspace.activePathRef,
		railCollapsed: panels.railCollapsed,
		gitOpen: panels.gitOpen,
		runToCursor: debug.runToCursor,
		saveActive: save.saveActive,
		saveAll: save.saveAll,
		formatActive: save.formatActive,
		setShortcutsOpen: overlays.setShortcutsOpen,
		setRailCollapsed: panels.setRailCollapsed,
		setPanelOpen: panels.setPanelOpen,
		showDebugger: panels.showDebugger,
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
		setRailCollapsed: panels.setRailCollapsed,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
		setCallsCursor: overlays.setCallsCursor,
		setCallsOpen: overlays.setCallsOpen,
		setTypeHierarchyCursor: overlays.setTypeHierarchyCursor,
		setTypeHierarchyOpen: overlays.setTypeHierarchyOpen,
	});

	const lspCommands = makeLspCommandHandlers({
		workspace,
		overlays: { setGotoMode: overlays.setGotoMode },
		activePath,
		cursor,
		onNotice,
	});

	const runDebug = useRunDebug({
		root,
		profile: settings.buildProfile,
		runs,
		debug,
		onReveal: workspace.handleNavigate,
		onOpenDebug: panels.showDebugger,
		onOpenRun: panels.showRun,
		onNotice: (message) => onNotice?.(message),
	});

	useClionKeymap({
		root,
		activePath,
		cursor,
		running: runs.running,
		debug,
		run: runDebug.run,
		debugNow: runDebug.debugNow,
		stop: runDebug.stop,
		toggleBreakpoint: debug.toggleBreakpoint,
		organizeImports: () => editorActions.organizeRef.current(),
		openRunPanel: runs.openPanel,
		showDebugger: panels.showDebugger,
		setGotoMode: overlays.setGotoMode,
		setGenerateOpen: overlays.setGenerateOpen,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
		setRailCollapsed: panels.setRailCollapsed,
		setTerminalOpen: panels.setTerminalOpen,
		setSettingsOpen: panels.setSettingsOpen,
		setSettingsTab: panels.setSettingsTab,
		gotoImplementation: lspCommands.gotoImplementation,
		gotoTypeDefinition: lspCommands.gotoTypeDefinition,
		quickDoc: lspCommands.quickDoc,
	});
	const commands = shellCommands({
		root,
		activePath,
		cursor,
		panelExpanded,
		workspace,
		overlays,
		panels,
		git,
		save,
		build,
		runs,
		debug,
		lsp: lspCommands,
		run: runDebug.run,
		debugNow: runDebug.debugNow,
	});

	useSessionPersistence({
		snapshotRef,
		setters: {
			onPreferences: (next) => settings.setPreferences(normalizePreferences(next)),
			onRailCollapsed: panels.setRailCollapsed,
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

	const dispatchRef = useRef<(id: string) => void>(() => {});
	dispatchRef.current = (id: string) => {
		if (id === "open-settings") {
			panels.setSettingsTab(root === null ? "user" : "project");
			panels.setSettingsOpen(true);
			return;
		}
		const command = commands.find((entry) => entry.id === id);
		if (command !== undefined && command.disabled !== true) command.run();
	};
	const runCommand = useCallback((id: string) => dispatchRef.current(id), []);

	useShellEffects(runCommand);

	return { commands, runCommand, runDebug };
}
