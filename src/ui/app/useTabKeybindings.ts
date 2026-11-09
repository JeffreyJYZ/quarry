import { useEffect } from "react";
import { inTerminal } from "@/ui/app/focusGuard";

/**
 * Cmd+W closes the active tab, Ctrl+Tab and Ctrl+Shift+Tab walk the strip.
 *
 * Cmd+W is swallowed even when the editor has focus: in a webview it otherwise reaches the window
 * and closes it, which loses every unsaved buffer at once. A terminal is the exception: every key
 * typed into it belongs to the shell, so none of these chords may touch the editor's tabs.
 */
export function useTabKeybindings({
	closeActiveTab,
	cycleTab,
	reopenClosedTab,
}: {
	closeActiveTab: () => void;
	cycleTab: (step: number) => void;
	reopenClosedTab: () => void;
}) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (inTerminal()) return;
			if (event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey) {
				if (event.key.toLowerCase() !== "t") return;
				event.preventDefault();
				reopenClosedTab();
				return;
			}
			if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
				if (event.key.toLowerCase() !== "w") return;
				event.preventDefault();
				closeActiveTab();
				return;
			}
			if (!event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key !== "Tab") return;
			event.preventDefault();
			cycleTab(event.shiftKey ? -1 : 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [closeActiveTab, cycleTab, reopenClosedTab]);
}
