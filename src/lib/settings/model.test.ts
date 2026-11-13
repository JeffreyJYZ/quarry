import { describe, expect, test } from "bun:test";
import { DEFAULT_PANEL_SIZES, PANEL_LIMITS } from "@/lib/layout/model";
import { DEFAULT_THEME_ID } from "@/lib/themes/model";
import {
	clampFontSize,
	DEFAULT_PREFERENCES,
	DEFAULT_PROJECT_SETTINGS,
	effectivePreferences,
	normalizePreferences,
	normalizeProjectSettings,
	projectSettingsAreEmpty,
} from "@/lib/settings/model";

describe("normalizePreferences", () => {
	test("fills every field from the defaults", () => {
		expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
		expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
		expect(normalizePreferences("bogus")).toEqual(DEFAULT_PREFERENCES);
	});

	test("an old file without theme fields loads with the default theme", () => {
		const preferences = normalizePreferences({ editorFontSize: 15 });
		expect(preferences.theme).toBe(DEFAULT_THEME_ID);
		expect(preferences.customThemes).toEqual([]);
	});

	test("keeps a preference key this build does not know", () => {
		const preferences = normalizePreferences({ editorFontSize: 15, futureKnob: 7 });
		expect(preferences.editorFontSize).toBe(15);
		expect((preferences as Record<string, unknown>).futureKnob).toBe(7);
	});

	test("a known key wins over the preserved copy of itself", () => {
		const preferences = normalizePreferences({ editorFontSize: 400, futureKnob: 7 });
		expect(preferences.editorFontSize).toBe(24);
		expect((preferences as Record<string, unknown>).futureKnob).toBe(7);
	});

	test("clamps font sizes and keeps a usable tab size and profile", () => {
		const preferences = normalizePreferences({
			editorFontSize: 400,
			terminalFontSize: 1,
			editorTabSize: 2,
			buildProfile: "release",
			formatOnSave: true,
		});
		expect(preferences.editorFontSize).toBe(24);
		expect(preferences.terminalFontSize).toBe(9);
		expect(preferences.editorTabSize).toBe(2);
		expect(preferences.buildProfile).toBe("release");
		expect(preferences.formatOnSave).toBe(true);
	});

	// The terminal panel renders at most 20pt (MIN_FONT_SIZE..MAX_FONT_SIZE); clamping it through
	// the editor's 9..24 range let Settings store 24 while the panel drew 20 — the control lied.
	test("the terminal font size is clamped to the terminal's own range", () => {
		expect(normalizePreferences({ terminalFontSize: 24 }).terminalFontSize).toBe(20);
		expect(normalizePreferences({ terminalFontSize: 40 }).terminalFontSize).toBe(20);
		expect(normalizePreferences({ terminalFontSize: 12 }).terminalFontSize).toBe(12);
	});

	test("rejects a tab size and profile the UI never offers", () => {
		const preferences = normalizePreferences({
			editorTabSize: 3,
			buildProfile: "fast",
			formatOnSave: "yes",
		});
		expect(preferences.editorTabSize).toBe(DEFAULT_PREFERENCES.editorTabSize);
		expect(preferences.buildProfile).toBe(DEFAULT_PREFERENCES.buildProfile);
		expect(preferences.formatOnSave).toBe(DEFAULT_PREFERENCES.formatOnSave);
	});

	test("clamps panel sizes through the layout model", () => {
		const preferences = normalizePreferences({
			panelSizes: { railWidth: 5, dockHeight: 5000 },
		});
		expect(preferences.panelSizes.railWidth).toBe(PANEL_LIMITS.railWidth.min);
		expect(preferences.panelSizes.dockHeight).toBe(PANEL_LIMITS.dockHeight.max);
		expect(preferences.panelSizes.terminalHeight).toBe(DEFAULT_PANEL_SIZES.terminalHeight);
	});
});

describe("normalizeProjectSettings", () => {
	test("reads missing values as inherited", () => {
		expect(normalizeProjectSettings({})).toEqual(DEFAULT_PROJECT_SETTINGS);
		expect(normalizeProjectSettings(null)).toEqual(normalizeProjectSettings({}));
	});

	test("keeps valid overrides and drops invalid ones", () => {
		const settings = normalizeProjectSettings({
			editorTabSize: 8,
			formatOnSave: false,
			buildProfile: "nope",
		});
		expect(settings.editorTabSize).toBe(8);
		expect(settings.formatOnSave).toBe(false);
		expect(settings.buildProfile).toBeNull();
	});

	test("keeps an override key this build does not know", () => {
		const settings = normalizeProjectSettings({ formatOnSave: true, futureOverride: "keep" });
		expect(settings.formatOnSave).toBe(true);
		expect((settings as Record<string, unknown>).futureOverride).toBe("keep");
	});
});

describe("effectivePreferences", () => {
	test("inherits every unset project value", () => {
		const effective = effectivePreferences(DEFAULT_PREFERENCES, {
			...DEFAULT_PROJECT_SETTINGS,
		});
		expect(effective.editorTabSize).toBe(DEFAULT_PREFERENCES.editorTabSize);
		expect(effective.formatOnSave).toBe(DEFAULT_PREFERENCES.formatOnSave);
		expect(effective.buildProfile).toBe(DEFAULT_PREFERENCES.buildProfile);
	});

	test("a project override wins, including a false boolean", () => {
		const user = { ...DEFAULT_PREFERENCES, formatOnSave: true, buildProfile: "debug" as const };
		const effective = effectivePreferences(user, {
			...DEFAULT_PROJECT_SETTINGS,
			editorTabSize: 2,
			formatOnSave: false,
			buildProfile: "release",
		});
		expect(effective.editorTabSize).toBe(2);
		expect(effective.formatOnSave).toBe(false);
		expect(effective.buildProfile).toBe("release");
	});

	test("editor and terminal font sizes always come from the user", () => {
		const user = { ...DEFAULT_PREFERENCES, editorFontSize: 16, terminalFontSize: 15 };
		const effective = effectivePreferences(user, null);
		expect(effective.editorFontSize).toBe(16);
		expect(effective.terminalFontSize).toBe(15);
	});
});

describe("projectSettingsAreEmpty", () => {
	test("true only when nothing is overridden", () => {
		expect(
			projectSettingsAreEmpty({
				...DEFAULT_PROJECT_SETTINGS,
			}),
		).toBe(true);
		expect(
			projectSettingsAreEmpty({
				...DEFAULT_PROJECT_SETTINGS,
				editorTabSize: 2,
			}),
		).toBe(false);
		expect(
			projectSettingsAreEmpty({
				...DEFAULT_PROJECT_SETTINGS,
				cmakePreset: "dev",
			}),
		).toBe(false);
	});
});

describe("clampFontSize", () => {
	test("rounds and clamps, and falls back on a non-number", () => {
		expect(clampFontSize(13.4, 13)).toBe(13);
		expect(clampFontSize(0, 13)).toBe(9);
		expect(clampFontSize(99, 13)).toBe(24);
		expect(clampFontSize(Number.NaN, 13)).toBe(13);
		expect(clampFontSize("15", 13)).toBe(13);
	});
});
