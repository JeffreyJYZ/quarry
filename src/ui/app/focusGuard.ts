/** Focus predicates shared by the window-level keymaps. */
export function inEditableTarget(): boolean {
	const focused = document.activeElement;
	if (focused === null) return false;
	const tag = focused.tagName?.toLowerCase();
	if (tag === "input" || tag === "textarea" || tag === "select") return true;
	if (
		typeof HTMLElement !== "undefined" &&
		focused instanceof HTMLElement &&
		focused.isContentEditable
	)
		return true;
	if (focused.getAttribute?.("contenteditable") !== null) return true;
	return false;
}

export function inTerminal(): boolean {
	const focused = document.activeElement;
	if (typeof Element === "undefined" || !(focused instanceof Element)) {
		// Fallback for non-DOM test environments.
		if (focused !== null && typeof (focused as { closest?: unknown }).closest === "function") {
			return (focused as { closest: (s: string) => unknown }).closest(".xterm") !== null;
		}
		return false;
	}
	return focused.closest(".xterm") !== null;
}
