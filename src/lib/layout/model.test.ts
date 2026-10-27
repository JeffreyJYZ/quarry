import { describe, expect, test } from "bun:test";
import {
	clampPanel,
	clampPanelSizes,
	DEFAULT_PANEL_SIZES,
	PANEL_LIMITS,
	resizePanel,
} from "@/lib/layout/model";

describe("clampPanel", () => {
	test("keeps a value inside the limits", () => {
		expect(clampPanel("railWidth", 300)).toBe(300);
	});

	test("clamps to the published bounds", () => {
		expect(clampPanel("railWidth", 10)).toBe(PANEL_LIMITS.railWidth.min);
		expect(clampPanel("railWidth", 9999)).toBe(PANEL_LIMITS.railWidth.max);
		expect(clampPanel("terminalHeight", 1)).toBe(PANEL_LIMITS.terminalHeight.min);
	});

	test("falls back to the default for a non-finite value", () => {
		expect(clampPanel("dockHeight", Number.NaN)).toBe(DEFAULT_PANEL_SIZES.dockHeight);
		expect(clampPanel("dockHeight", Number.POSITIVE_INFINITY)).toBe(
			DEFAULT_PANEL_SIZES.dockHeight,
		);
	});
});

describe("clampPanelSizes", () => {
	test("fills every missing panel from the defaults", () => {
		expect(clampPanelSizes({})).toEqual(DEFAULT_PANEL_SIZES);
		expect(clampPanelSizes(null)).toEqual(DEFAULT_PANEL_SIZES);
		expect(clampPanelSizes("bogus")).toEqual(DEFAULT_PANEL_SIZES);
	});

	test("keeps usable entries and replaces the rest", () => {
		const sizes = clampPanelSizes({ railWidth: 320, dockHeight: "tall", terminalHeight: 5 });
		expect(sizes.railWidth).toBe(320);
		expect(sizes.dockHeight).toBe(DEFAULT_PANEL_SIZES.dockHeight);
		expect(sizes.terminalHeight).toBe(PANEL_LIMITS.terminalHeight.min);
	});

	test("clamps out-of-range entries", () => {
		const sizes = clampPanelSizes({
			railWidth: 5000,
			dockHeight: 5000,
			terminalHeight: 1,
			terminalWidth: 1,
		});
		expect(sizes).toEqual({
			railWidth: PANEL_LIMITS.railWidth.max,
			dockHeight: PANEL_LIMITS.dockHeight.max,
			terminalHeight: PANEL_LIMITS.terminalHeight.min,
			terminalWidth: PANEL_LIMITS.terminalWidth.min,
			outlineHeight: DEFAULT_PANEL_SIZES.outlineHeight,
		});
	});
});

describe("resizePanel", () => {
	test("moves one panel and leaves the others alone", () => {
		const next = resizePanel(DEFAULT_PANEL_SIZES, "dockHeight", 400);
		expect(next.dockHeight).toBe(400);
		expect(next.railWidth).toBe(DEFAULT_PANEL_SIZES.railWidth);
		expect(next.terminalHeight).toBe(DEFAULT_PANEL_SIZES.terminalHeight);
	});

	test("clamps the new value and never mutates the input", () => {
		const before = { ...DEFAULT_PANEL_SIZES };
		const next = resizePanel(DEFAULT_PANEL_SIZES, "railWidth", 10);
		expect(next.railWidth).toBe(PANEL_LIMITS.railWidth.min);
		expect(DEFAULT_PANEL_SIZES).toEqual(before);
	});
});
