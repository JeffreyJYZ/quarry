/**
 * What a typed line number means.
 *
 * Anything that is not a number is not a jump. A number past the end clamps to the last line, which
 * is what typing 9999 means in a file of 40, and a zero or negative one clamps to the first.
 */
export function parseLine(input: string, total: number): number | null {
	const trimmed = input.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const value = Number.parseInt(trimmed, 10);
	if (value <= 0) return 1;
	return Math.min(value, Math.max(total, 1));
}
