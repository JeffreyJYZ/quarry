import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The command palette's list.
 *
 * Built from the shell's callbacks so the palette stays a pure view: each command names one action
 * and its accelerator, and disabling follows whatever the action needs.
 */
export function buildCommands(context: CommandContext): Command[] {
	const { root, activePath, cursor, building, formatting, running } = context;
	return [
		{
			id: "open-project",
			label: "Open project",
			hint: "",
			run: context.openProject,
		},
		{
			id: "build",
			label: "Build",
			hint: "",
			disabled: root === null || building,
			run: context.build,
		},
		{
			id: "run",
			label: "Run",
			hint: "Shift+F10",
			disabled: root === null || running !== null,
			run: context.run,
		},
		{
			id: "debug",
			label: "Debug",
			hint: "Shift+F9",
			disabled: root === null || running !== null,
			run: context.debug,
		},
		{
			id: "stop-run",
			label: "Stop",
			hint: "Cmd+F2",
			disabled: running === null,
			run: context.stop,
		},
		{
			id: "toggle-debug",
			label: "Toggle debug panel",
			hint: "",
			disabled: root === null,
			run: context.toggleDebug,
		},
		{
			id: "toggle-source-control",
			label: "Toggle source control",
			hint: "",
			disabled: root === null,
			run: context.toggleGit,
		},
		{
			id: "save",
			label: "Save",
			hint: "Cmd+S",
			disabled: root === null || activePath === null,
			run: context.save,
		},
		{
			id: "save-all",
			label: "Save all",
			hint: "Cmd+Alt+S",
			disabled: root === null,
			run: context.saveAll,
		},
		{
			id: "format",
			label: "Format file",
			hint: "Cmd+Alt+L",
			disabled: root === null || activePath === null || formatting,
			run: context.format,
		},
		{
			id: "find-in-project",
			label: "Find in project",
			hint: "Cmd+Alt+F",
			disabled: root === null,
			run: context.openSearch,
		},
		{
			id: "toggle-rail",
			label: "Toggle rail",
			hint: "Cmd+B",
			run: context.toggleRail,
		},
		{
			id: "toggle-dock",
			label: "Toggle dock",
			hint: "Cmd+J",
			run: context.toggleDock,
		},
		{
			id: "toggle-terminal",
			label: "Toggle terminal",
			hint: "",
			disabled: root === null,
			run: context.toggleTerminal,
		},
		{
			id: "reveal-active-file",
			label: "Reveal active file in explorer",
			hint: "Cmd+Shift+E",
			disabled: root === null || activePath === null,
			run: context.revealFile,
		},
		{
			id: "quick-open",
			label: "Quick open",
			hint: "Cmd+P",
			disabled: root === null,
			run: context.openQuick,
		},
		{
			id: "run-to-cursor",
			label: "Run to cursor",
			hint: "Cmd+F10",
			disabled: activePath === null || cursor === null,
			run: () => {
				if (activePath !== null && cursor !== null) {
					context.runToCursor(activePath, cursor.line + 1);
				}
			},
		},
		{
			id: "show-shortcuts",
			label: "Show shortcuts",
			hint: "Cmd+K",
			run: context.openShortcuts,
		},
		{
			id: "refresh-git",
			label: "Refresh git",
			hint: "",
			disabled: root === null,
			run: context.refreshGit,
		},
		{
			id: "toggle-blame",
			label: "Toggle blame annotations",
			hint: "",
			disabled: root === null || activePath === null,
			run: context.toggleBlame,
		},
		{
			id: "new-project",
			label: "New project",
			hint: "",
			run: context.newProject,
		},
		{
			id: "check-updates",
			label: "Check for updates",
			hint: "",
			run: context.checkUpdates,
		},
		{
			id: "workspace-symbol",
			label: "Go to symbol in workspace…",
			hint: "Cmd+Alt+O",
			disabled: root === null,
			run: context.workspaceSymbol,
		},
		{
			id: "goto-implementation",
			label: "Go to implementation",
			hint: "Cmd+Alt+B",
			disabled: root === null || activePath === null || cursor === null,
			run: context.gotoImplementation,
		},
		{
			id: "goto-type-definition",
			label: "Go to type definition",
			hint: "Cmd+Alt+Y",
			disabled: root === null || activePath === null || cursor === null,
			run: context.gotoTypeDefinition,
		},
		{
			id: "quick-doc",
			label: "Quick documentation",
			hint: "F1",
			disabled: root === null || activePath === null || cursor === null,
			run: context.quickDoc,
		},
	];
}
