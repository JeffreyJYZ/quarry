import { describe, expect, test } from "bun:test";
import { derivedEditorColours, hexToHsl, hslToHex, rotateHue } from "@/lib/themes/derive";

describe("derive", () => {
	test("round-trips a hex through hsl", () => {
		expect(hslToHex(hexToHsl("#e06c75")!)).toBe("#e06c75");
		expect(hslToHex(hexToHsl("#fff")!)).toBe("#ffffff");
	});

	test("rotation keeps the lightness and moves the hue", () => {
		const base = hexToHsl("#61afef")!;
		const rotated = hexToHsl(rotateHue("#61afef", 118))!;
		expect(Math.abs(rotated.l - base.l)).toBeLessThan(0.02);
		const delta = Math.abs(((rotated.h - base.h + 540) % 360) - 180);
		expect(delta).toBeGreaterThan(60);
	});

	test("every derived category is its own hue, in every palette", () => {
		const palettes = [
			{ type: "#e5c07b", identifier: "#c8ccd4" },
			{ type: "#8fbcbb", identifier: "#d8dee9" },
			{ type: "#a626a4", identifier: "#383a42" },
		];
		for (const palette of palettes) {
			const colours = derivedEditorColours(palette);
			const entries = Object.entries({ ...colours, type: palette.type });
			for (let i = 0; i < entries.length; i += 1) {
				for (let j = i + 1; j < entries.length; j += 1) {
					const a = hexToHsl(entries[i][1])!.h;
					const b = hexToHsl(entries[j][1])!.h;
					const delta = Math.abs(((a - b + 540) % 360) - 180);
					expect(delta).toBeGreaterThan(30);
				}
			}
		}
	});

	test("a grey type colour falls back to the identifier hue", () => {
		const colours = derivedEditorColours({ type: "#808080", identifier: "#c8ccd4" });
		expect(hexToHsl(colours.field)!.s).toBeGreaterThan(0.3);
		expect(colours.field).not.toBe(colours.parameter);
	});
});
