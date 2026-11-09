import { describe, expect, test } from "bun:test";
import { BUILTIN_THEMES } from "@/lib/themes/builtin";

function linearise(c: number): number {
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
	const h = hex.replace("#", "").slice(0, 6);
	const r = parseInt(h.slice(0, 2), 16) / 255;
	const g = parseInt(h.slice(2, 4), 16) / 255;
	const b = parseInt(h.slice(4, 6), 16) / 255;
	return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrast(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

describe("built-in theme contrast", () => {
	for (const theme of BUILTIN_THEMES) {
		test(`${theme.id}: comment on bg >= 4.5:1`, () => {
			expect(contrast(theme.tokens.comment, theme.tokens.bg)).toBeGreaterThanOrEqual(4.5);
		});
		test(`${theme.id}: danger on bg >= 4.5:1`, () => {
			expect(contrast(theme.tokens.danger, theme.tokens.bg)).toBeGreaterThanOrEqual(4.5);
		});
	}
});
