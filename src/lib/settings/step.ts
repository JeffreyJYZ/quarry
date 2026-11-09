/**
 * One step of a bounded number control.
 *
 * The stepper, the number field inside it and the zoom shortcut move the same value, so the
 * arithmetic lives here: the caller's own range bounds the step, not a global font range that only
 * happens to match today, and a non-number falls back to the value already stored.
 */
export function stepValue(
	value: unknown,
	delta: number,
	min: number,
	max: number,
	fallback: number,
): number {
	const number = typeof value === "number" ? value : Number.NaN;
	if (!Number.isFinite(number)) return Math.min(max, Math.max(min, fallback));
	return Math.round(Math.min(max, Math.max(min, number + delta)));
}
