import { useEffect } from "react";
import type { BookmarkStep } from "@/lib/bookmarks/navigate";

/** The chords a bookmark step needs: Cmd and Alt, nothing else. */
type Chord = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * `Cmd+Alt+N` and `Cmd+Alt+P`, the next and previous bookmark.
 *
 * Neither is a native menu accelerator and no editor keymap claims them, so the keydown reaches the
 * window with nobody else to answer it. They share Cmd+Alt with the bookmark toggle on K, which is
 * where a reader looks for the pair.
 */
export function bookmarkStep(event: Chord): BookmarkStep | null {
	if (!event.metaKey || event.ctrlKey || !event.altKey || event.shiftKey) return null;
	const key = event.key.toLowerCase();
	if (key === "n") return 1;
	if (key === "p") return -1;
	return null;
}

/**
 * The window-level binding.
 *
 * It listens on capture because the caret is usually inside the editor, which handles its own keys;
 * walking the list is a shell action, the same wherever focus sits.
 */
export function useBookmarkNavKey(options: { step: (direction: BookmarkStep) => void }): void {
	const { step } = options;
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const direction = bookmarkStep(event);
			if (direction === null) return;
			event.preventDefault();
			step(direction);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [step]);
}
