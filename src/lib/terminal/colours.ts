/** The sixteen ANSI colours, in the theme's own palette, plus the 256-colour reader. */

const BASIC = [
	"#3b4048",
	"#e06c75",
	"#7fc98f",
	"#d9b26a",
	"#5b8def",
	"#c678dd",
	"#56b6c2",
	"#d7dbe0",
	"#5c6370",
	"#ef8790",
	"#a3d9ad",
	"#e8c98d",
	"#7ea6f2",
	"#d79ce8",
	"#7fd0d9",
	"#ffffff",
];

export function basicColour(index: number): string | null {
	if (index < 0 || index > 15) return null;
	return BASIC[index] ?? null;
}

/** `38;5;N` and `38;2;R;G;B` share a shape, so one reader handles both plus the plain `3x` forms. */
export function readColour(
	params: number[],
	start: number,
): { colour: string | null; next: number } {
	const mode = params[start];
	if (mode === 5) {
		const index = params[start + 1];
		if (index === undefined || index < 0 || index > 255) {
			return { colour: null, next: start + 2 };
		}
		if (index < 16) return { colour: basicColour(index), next: start + 2 };
		if (index >= 232) {
			// The 24-step grey ramp.
			const level = 8 + (index - 232) * 10;
			return { colour: `rgb(${level} ${level} ${level})`, next: start + 2 };
		}
		const n = index - 16;
		const r = Math.floor(n / 36);
		const g = Math.floor((n % 36) / 6);
		const b = n % 6;
		const step = (value: number) => (value === 0 ? 0 : 55 + value * 40);
		return { colour: `rgb(${step(r)} ${step(g)} ${step(b)})`, next: start + 2 };
	}
	if (mode === 2) {
		const [r, g, b] = [params[start + 1], params[start + 2], params[start + 3]];
		if (r === undefined || g === undefined || b === undefined) {
			return { colour: null, next: start + 4 };
		}
		const clamp = (value: number) => Math.max(0, Math.min(255, value));
		return { colour: `rgb(${clamp(r)} ${clamp(g)} ${clamp(b)})`, next: start + 4 };
	}
	return { colour: null, next: start + 1 };
}
