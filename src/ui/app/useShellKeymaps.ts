import type { useDebugSession } from "@/lib/debug/session";
import { zoomPreferences } from "@/lib/editor/zoom";
import type { makeLspCommandHandlers } from "@/ui/app/lspCommandHandlers";
import type { useEditorActions } from "@/ui/app/useEditorActions";
import { useClionKeymap } from "@/ui/app/useClionKeymap";
import { useGotoLineKey } from "@/ui/app/useGotoLineKey";
import { useKeybindings } from "@/ui/app/useKeybindings";
import type { useOverlays } from "@/ui/app/useOverlays";
import type { usePanels } from "@/ui/app/usePanels";
import type { useRunControls } from "@/ui/app/useRunControls";
import type { useSaveBuffers } from "@/ui/app/useSaveBuffers";
import { useSelectionKeybindings } from "@/ui/app/useSelectionKeybindings";
import type { useSettings } from "@/ui/app/useSettings";
import { useTabKeys } from "@/ui/app/useTabKeys";
import type { useWorkspace } from "@/ui/app/useWorkspace";

type Cursor = { line: number; character: number } | null;

/**
 * Every window-level accelerator the shell installs.
 *
 * Three groups, in the order they were written: the shell's own keys, the ones that act on a
 * selection, and CLion's map for the editor and the debugger. They are gathered here rather than in
 * the glue hook so that adding a key does not mean editing the file that also owns persistence and
 * the command dispatch.
 */
export function useShellKeymaps(options: {
	workspace: ReturnType<typeof useWorkspace>;
	overlays: ReturnType<typeof useOverlays>;
	panels: ReturnType<typeof usePanels>;
	settings: ReturnType<typeof useSettings>;
	save: ReturnType<typeof useSaveBuffers>;
	runs: ReturnType<typeof useRunControls>;
	debug: ReturnType<typeof useDebugSession>;
	editorActions: ReturnType<typeof useEditorActions>;
	lsp: ReturnType<typeof makeLspCommandHandlers>;
	runDebug: {
		run: () => void;
		debugNow: () => void;
		stop: () => void;
	};
	root: string | null;
	activePath: string | null;
	cursor: Cursor;
	panelExpanded: boolean;
}) {
	const { workspace, overlays, panels, settings, save, runs, debug, editorActions, lsp } =
		options;
	const { runDebug, root, activePath, cursor, panelExpanded } = options;
	const tabKeys = useTabKeys(workspace);
	useGotoLineKey({ activePath, open: () => overlays.setLineOpen(true) });

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
		...tabKeys,
		zoomEditor: (delta) =>
			settings.setPreferences((current) => zoomPreferences(current, delta)),
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
		gotoImplementation: lsp.gotoImplementation,
		gotoTypeDefinition: lsp.gotoTypeDefinition,
		quickDoc: lsp.quickDoc,
	});
}
