/**
 * The pure half of the modal focus trap.
 *
 * A dialog keeps Tab inside itself by wrapping at its two ends: forward from the last stop back to
 * the first, backward from the first to the last. Everything between the ends is left to the
 * browser, which already knows the order and any `tabindex` the markup sets.
 *
 * The arithmetic lives here, apart from the DOM, so it is tested without a browser.
 */

/** Focusable children, in tab order; `[tabindex="-1"]` and disabled controls cannot take focus. */
export const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab should move focus, as an index into the dialog's focusable elements.
 *
 * `current` is the focused element's index, or -1 when focus sits on the panel itself. Returns
 * `null` when the browser's own move is already correct, and `null` when the dialog holds nothing
 * focusable.
 */
export function dialogTabTarget(count: number, current: number, shift: boolean): number | null {
	if (count <= 0) return null;
	// Focus on the panel (or anywhere outside the list) starts the loop at its near end.
	if (current < 0) return shift ? count - 1 : 0;
	if (shift) return current === 0 ? count - 1 : null;
	return current === count - 1 ? 0 : null;
}

/** The dialog's focusable elements, in tab order. */
export function dialogFocusables(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}
