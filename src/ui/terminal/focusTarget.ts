/** Controls that own their focus: a click inside one must not pull focus away from it. */
const CONTROL_SELECTOR = "button, input, textarea, select, a";

/**
 * Whether a mousedown inside the terminal panel should hand focus to the typing surface.
 *
 * Everything that is not a control counts: the scrollback, the chrome background and the status
 * line all belong to the terminal, while an icon button keeps the focus it was clicked with.
 */
export function shouldFocusTerminal(target: EventTarget | null): boolean {
	if (target === null) return false;
	const node = target as Element;
	if (typeof node.closest !== "function") return true;
	return node.closest(CONTROL_SELECTOR) === null;
}
