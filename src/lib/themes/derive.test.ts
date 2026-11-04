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

	test("field, parameter and type are three different colours", () => {
		const colours = derivedEditorColours({ type: "#e5c07b", identifier: "#c8ccd4" });
		const hues = [colours.field, colours.parameter, "#e5c07b"].map((hex) => hexToHsl(hex)!.h);
		for (let i = 0; i < hues.length; i += 1) {
			for (let j = i + 1; j < hues.length; j += 1) {
				const delta = Math.abs(((hues[i] - hues[j] + 540) % 360) - 180);
				expect(delta).toBeGreaterThan(60);
			}
		}
	});

	test("a grey type colour falls back to the identifier hue", () => {
		const colours = derivedEditorColours({ type: "#808080", identifier: "#c8ccd4" });
		expect(hexToHsl(colours.field)!.s).toBeGreaterThan(0.3);
		expect(colours.field).not.toBe(colours.parameter);
	});
});
