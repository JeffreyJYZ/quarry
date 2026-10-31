import type { BuildModel } from "@/ui/app/useBuild";
import type { useDebugSession } from "@/lib/debug/session";
import type { useGitState } from "@/ui/app/useGitState";
import type { useOverlays } from "@/ui/app/useOverlays";
import type { usePanels } from "@/ui/app/usePanels";
import type { useRunControls } from "@/ui/app/useRunControls";
import type { useSaveBuffers } from "@/ui/app/useSaveBuffers";
import type { useWorkspace } from "@/ui/app/useWorkspace";
import type { Command } from "@/ui/palette/CommandPalette";
import { buildCommands } from "@/ui/app/commands";
import { openDisassembly } from "@/lib/debug/disasm";
import type { LspCommandHandlers } from "@/ui/app/lspCommandHandlers";

/**
 * The command palette's rows.
 *
 * The list is large enough that keeping its context here keeps the shell's own glue readable; every
 * entry still points at the same function the shortcut and the native menu call, so the palette
 * cannot drift into a second implementation of a command.
 */
export function shellCommands(options: {
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	panelExpanded: boolean;
	workspace: ReturnType<typeof useWorkspace>;
	overlays: ReturnType<typeof useOverlays>;
	panels: ReturnType<typeof usePanels>;
	git: ReturnType<typeof useGitState>;
	save: ReturnType<typeof useSaveBuffers>;
	build: BuildModel;
	runs: ReturnType<typeof useRunControls>;
	debug: ReturnType<typeof useDebugSession>;
	lsp: LspCommandHandlers;
	run: () => void;
	debugNow: () => void;
}): Command[] {
	const { root, activePath, cursor, panelExpanded, workspace, overlays, panels } = options;
	const { git, save, build, runs, debug, lsp } = options;

	return buildCommands({
		root,
		activePath,
		cursor,
		building: build.building,
		formatting: panels.formatting,
		running: runs.running,
		debugging: debug.sessionId !== null,
		panelExpanded,
		openProject: () => void workspace.handleOpenProject(),
		build: () => void build.build(),
		run: options.run,
		debug: options.debugNow,
		stop: () => void runs.stop(),
		save: () => void save.saveActive(),
		saveAll: () => void save.saveAll(),
		format: () => void save.formatActive(),
		runToCursor: (path, line) => debug.runToCursor(path, line),
		showDebugger: () => panels.showDebugger(),
		showDisassembly: () => openDisassembly(),
		toggleGit: () => panels.setGitOpen((current) => !current),
		openSearch: () => overlays.setSearchOpen(true),
		toggleRail: () => panels.setRailCollapsed((current) => !current),
		toggleDock: () => panels.setPanelOpen(!panelExpanded),
		// Only the terminal toggles: opening the bottom panel here also revealed Problems.
		toggleTerminal: () => panels.setTerminalOpen((current) => !current),
		revealFile: () => panels.setFileRevealToken((current) => current + 1),
		openQuick: () => overlays.setQuickOpenOpen(true),
		openShortcuts: () => overlays.setShortcutsOpen(true),
		workspaceSymbol: lsp.workspaceSymbol,
		gotoImplementation: lsp.gotoImplementation,
		gotoTypeDefinition: lsp.gotoTypeDefinition,
		quickDoc: lsp.quickDoc,
		refreshGit: () => git.setRefreshToken((current) => current + 1),
		toggleBlame: () => git.setBlameOn((current) => !current),
		newProject: () => panels.setNewProjectOpen(true),
		checkUpdates: () => {
			void import("@/lib/updates/store").then((updates) => updates.checkForUpdates());
		},
	});
}
