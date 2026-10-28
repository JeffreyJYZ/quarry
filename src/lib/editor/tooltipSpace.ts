export type Box = { left: number; top: number; right: number; bottom: number };

/** A pane shorter than this cannot hold a popup, so its bounds would hide one rather than move it. */
const MIN_PANE_HEIGHT = 200;

/**
 * The area a popup may occupy: the editor pane, clipped to the window.
 *
 * CodeMirror measures the room around the caret against this box, so a caret near the bottom of
 * the pane flips the hover above it instead of dropping over the panels below the editor.
 */
export function tooltipSpace(pane: Box, viewport: Box): Box {
	const clipped = {
		left: Math.max(pane.left, viewport.left),
		top: Math.max(pane.top, viewport.top),
		right: Math.min(pane.right, viewport.right),
		bottom: Math.min(pane.bottom, viewport.bottom),
	};
	return clipped.bottom - clipped.top < MIN_PANE_HEIGHT ? viewport : clipped;
}
