import { useEffect } from "react";

/** The chord a `KeyboardEvent` has to carry to toggle the split: Cmd+` on this layout. */
type Chord = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * `Mod+`` — no native menu accelerator and no editor keymap claims it.
 *
 * The chord is fixed here rather than read from the sheet so the binding and the documented row
 * cannot drift; `useSplitKey.test.ts` pins the two against each other and against the menu source.
 */
export function isSplitChord(event: Chord): boolean {
	if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
	return event.key === "`";
}

/**
 * The window-level binding.
 *
 * It listens on capture because the caret is usually inside one of the two editors, which handle
 * their own keys; the split is a shell action from either pane.
 */
export function useSplitKey(options: { toggle: () => void }): void {
	const { toggle } = options;
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isSplitChord(event)) return;
			event.preventDefault();
			toggle();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [toggle]);
}
