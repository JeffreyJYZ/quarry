import { useCallback, useState } from "react";
import type { StatusText } from "@/ui/app/status";
import type { DockTab } from "@/ui/tests/TestsDock";

/**
 * The shell's chrome: which regions are open and which dialog is up.
 *
 * Nothing here is domain state; the workspace, the run panel and the debugger own their own. These
 * are the flags a toolbar button or an accelerator flips.
 */
export function usePanels() {
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [gitOpen, setGitOpen] = useState(false);
	/** `null` means "follow the default": open when there is an error, collapsed otherwise. */
	const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
	const [dockTab, setDockTab] = useState<DockTab>("problems");
	const [terminalOpen, setTerminalOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	/** Which settings tab a shortcut asked for. */
	const [settingsTab, setSettingsTab] = useState<"user" | "project">("user");
	const [formatting, setFormatting] = useState(false);
	const [saveStatus, setSaveStatus] = useState<StatusText | null>(null);
	const [gitDiffPath, setGitDiffPath] = useState<string | null>(null);
	const [gitCommitDiffHash, setGitCommitDiffHash] = useState<string | null>(null);
	const [newProjectOpen, setNewProjectOpen] = useState(false);
	/** Directory the New project dialog starts in; remembered in settings. */
	const [newProjectParent, setNewProjectParent] = useState("");
	const [fileRevealToken, setFileRevealToken] = useState(0);

	/** The debugger is a dock tab now, so showing it means selecting the tab and expanding. */
	const showDebugger = useCallback(() => {
		setDockTab("debugger");
		setPanelOpen(true);
	}, []);

	/** The same for a run: its output is the Run tab, and it has to be visible to be read. */
	const showRun = useCallback(() => {
		setDockTab("run");
		setPanelOpen(true);
	}, []);

	return {
		railCollapsed,
		setRailCollapsed,
		gitOpen,
		setGitOpen,
		panelOpen,
		setPanelOpen,
		dockTab,
		setDockTab,
		terminalOpen,
		setTerminalOpen,
		settingsOpen,
		setSettingsOpen,
		settingsTab,
		setSettingsTab,
		formatting,
		setFormatting,
		saveStatus,
		setSaveStatus,
		gitDiffPath,
		setGitDiffPath,
		gitCommitDiffHash,
		setGitCommitDiffHash,
		newProjectOpen,
		setNewProjectOpen,
		newProjectParent,
		setNewProjectParent,
		fileRevealToken,
		setFileRevealToken,
		showDebugger,
		showRun,
	};
}

export type Panels = ReturnType<typeof usePanels>;
