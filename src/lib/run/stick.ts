/** How close to the bottom a scroll position still counts as "at the bottom". */
export const STICK_THRESHOLD = 24;

/** The scroll geometry the stick decision reads; a real element satisfies this too. */
export type ScrollMetrics = {
	scrollHeight: number;
	scrollTop: number;
	clientHeight: number;
};

/** Pixels between the viewport's bottom edge and the newest row. */
export function distanceFromBottom(metrics: ScrollMetrics): number {
	return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
}

/**
 * Whether the log follows the next line.
 *
 * A threshold rather than an exact equality, because a subpixel scroll height never equals the sum
 * it is drawn from. The answer is recomputed on resize as well as scroll: the pane can grow or
 * shrink while the scroll position stays put, and a stale `true` snapped a user who was reading
 * just above the bottom down on the next line.
 */
export function sticksToBottom(
	metrics: ScrollMetrics,
	threshold: number = STICK_THRESHOLD,
): boolean {
	return distanceFromBottom(metrics) < threshold;
}
