import { useEffect } from "react";
import { isStructureChord } from "./chord";

/**
 * Cmd+F12 opens the File Structure popup from anywhere.
 *
 * It listens on the capture phase without a focus guard: the chord is not the editor's, so it must
 * work with the caret in the editor, a panel or the terminal.
 */
export function useStructureKey(setOpen: (open: boolean) => void): void {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isStructureChord(event)) return;
			event.preventDefault();
			setOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [setOpen]);
}
