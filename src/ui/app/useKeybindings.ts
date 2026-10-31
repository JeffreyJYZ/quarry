import { useEffect } from "react";
import { inTerminal } from "@/ui/app/focusGuard";
import { useTabKeybindings } from "@/ui/app/useTabKeybindings";

type Cursor = { line: number; character: number } | null;

export type KeybindingContext = {
	root: string | null;
	activePath: string | null;
	cursor: Cursor;
	panelExpanded: boolean;
	/** Whether the left column is on screen, and which view it holds, so a shortcut toggles the same pair the rail does. */
	railCollapsed: boolean;
	gitOpen: boolean;
	activePathRef: React.RefObject<string | null>;
	runToCursor: (path: string, line: number) => void;
	saveActive: () => unknown;
	saveAll: () => unknown;
	formatActive: () => unknown;
	setShortcutsOpen: (updater: (current: boolean) => boolean) => void;
	setRailCollapsed: (updater: (current: boolean) => boolean) => void;
	setPanelOpen: (next: boolean) => void;
	showDebugger: () => void;
	setGitOpen: (updater: (current: boolean) => boolean) => void;
	setCommandPaletteOpen: (open: boolean) => void;
	setFileRevealToken: (updater: (current: number) => number) => void;
	setQuickOpenOpen: (open: boolean) => void;
	setSearchOpen: (open: boolean) => void;
	setCallsCursor: (cursor: Cursor) => void;
	setCallsOpen: (open: boolean) => void;
	setTypeHierarchyCursor: (cursor: Cursor) => void;
	setTypeHierarchyOpen: (open: boolean) => void;
	/** Step the editor font, or reset it when the step is zero. */
	zoomEditor: (delta: number) => void;
	closeActiveTab: () => void;
	cycleTab: (step: number) => void;
};

function inEditor(): boolean {
	const focused = document.activeElement;
	return focused instanceof Element && focused.closest(".cm-editor") !== null;
}

function inInput(): boolean {
	const focused = document.activeElement;
	return (
		focused instanceof HTMLInputElement ||
		focused instanceof HTMLTextAreaElement ||
		(focused instanceof HTMLElement && focused.isContentEditable)
	);
}

/**
 * Every window-level accelerator the shell owns.
 *
 * The editor handles its own keys; these are the ones that must work wherever focus sits, so they
 * register on the capture phase and each decides whether the focused element disqualifies it.
 */
export function useKeybindings(context: KeybindingContext): void {
	const { root, activePath, panelExpanded, saveActive, saveAll, formatActive } = context;
	useTabKeybindings({ closeActiveTab: context.closeActiveTab, cycleTab: context.cycleTab });

	/** Cmd+S saves, Cmd+Alt+S saves everything, Cmd+Alt+L formats, Cmd+F finds in project. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey) return;
			const key = event.key.toLowerCase();
			if (key === "s" && !event.shiftKey) {
				/* Swallowed unconditionally: the webview must never raise its own save dialog. */
				event.preventDefault();
				if (event.altKey) void saveAll();
				else void saveActive();
				return;
			}
			if (key === "l" && event.altKey && root !== null && activePath !== null) {
				event.preventDefault();
				void formatActive();
				return;
			}
			if (event.altKey || event.shiftKey || key !== "f" || root === null) return;
			if (inEditor()) return;
			event.preventDefault();
			context.setSearchOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root, saveActive, saveAll, formatActive, activePath, context.setSearchOpen]);

	/** Cmd+K toggles the shortcut sheet; `?` opens it outside the editor and any input. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
				if (event.key.toLowerCase() === "k") {
					event.preventDefault();
					context.setShortcutsOpen((current) => !current);
					return;
				}
			}
			if (
				event.key === "?" &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				if (inEditor() || inInput()) return;
				event.preventDefault();
				context.setShortcutsOpen(() => true);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [context.setShortcutsOpen]);

	/** Layout toggles: Cmd+B rail, Cmd+J dock, Cmd+Shift+D debugger tab, Cmd+Shift+G git. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			if (inEditor() || inInput() || inTerminal()) return;
			const key = event.key.toLowerCase();
			if (!event.shiftKey) {
				if (key === "b") {
					event.preventDefault();
					context.setRailCollapsed((current) => !current);
					return;
				}
				if (key === "j") {
					event.preventDefault();
					context.setPanelOpen(!panelExpanded);
				}
				return;
			}
			if (key === "d") {
				event.preventDefault();
				context.showDebugger();
				return;
			}
			if (key === "g") {
				event.preventDefault();
				const showing = !context.railCollapsed && context.gitOpen;
				context.setRailCollapsed(() => showing);
				context.setGitOpen(() => !showing);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [
		panelExpanded,
		context.railCollapsed,
		context.gitOpen,
		context.setRailCollapsed,
		context.setPanelOpen,
		context.showDebugger,
		context.setGitOpen,
	]);

	/**
	 * Cmd+= and Cmd+- step the editor font, Cmd+0 puts it back.
	 *
	 * Swallowed even inside the editor: a webview's own zoom would scale the whole window and leave
	 * the settings page claiming a font size the editor is not using.
	 */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key;
			if (key === "=" || key === "+") {
				event.preventDefault();
				context.zoomEditor(1);
				return;
			}
			if (key === "-" || key === "_") {
				event.preventDefault();
				context.zoomEditor(-1);
				return;
			}
			if (key === "0") {
				event.preventDefault();
				context.zoomEditor(0);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [context.zoomEditor]);

	/** Cmd+Shift+P opens the command palette. */ useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) return;
			if (event.key.toLowerCase() !== "p") return;
			event.preventDefault();
			context.setCommandPaletteOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [context.setCommandPaletteOpen]);
}
