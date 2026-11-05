import { useEffect } from "react";

/**
 * The two Cmd+Shift accelerators the shell owns.
 *
 * They live here rather than beside the rest of the keybindings because they fire on the capture
 * phase regardless of focus, while every other key decides whether the focused element disqualifies
 * it. Keeping them separate is also what keeps the main keybinding hook inside the file-size limit.
 */
export function useMetaShortcuts(options: {
	restartLsp: () => void;
	setCommandPaletteOpen: (open: boolean) => void;
}): void {
	const { restartLsp, setCommandPaletteOpen } = options;

	/** Cmd+Shift+R stops every language server for the root and starts it again. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) return;
			if (event.key.toLowerCase() !== "r") return;
			event.preventDefault();
			restartLsp();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [restartLsp]);

	/** Cmd+Shift+P opens the command palette. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) return;
			if (event.key.toLowerCase() !== "p") return;
			event.preventDefault();
			setCommandPaletteOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [setCommandPaletteOpen]);
}
