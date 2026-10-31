import { describe, expect, test } from "bun:test";
import { zoomPreferences } from "@/lib/editor/zoom";
import { DEFAULT_PREFERENCES, FONT_SIZE_RANGE } from "@/lib/settings/model";

const base = DEFAULT_PREFERENCES;

describe("zoomPreferences", () => {
	test("steps up and down by one", () => {
		expect(zoomPreferences(base, 1).editorFontSize).toBe(base.editorFontSize + 1);
		expect(zoomPreferences(base, -1).editorFontSize).toBe(base.editorFontSize - 1);
	});

	test("stops at the range the settings page allows", () => {
		const atMax = { ...base, editorFontSize: FONT_SIZE_RANGE.max };
		const atMin = { ...base, editorFontSize: FONT_SIZE_RANGE.min };
		expect(zoomPreferences(atMax, 1).editorFontSize).toBe(FONT_SIZE_RANGE.max);
		expect(zoomPreferences(atMin, -1).editorFontSize).toBe(FONT_SIZE_RANGE.min);
	});

	test("a zero step restores the default", () => {
		const zoomed = { ...base, editorFontSize: FONT_SIZE_RANGE.max };
		expect(zoomPreferences(zoomed, 0).editorFontSize).toBe(base.editorFontSize);
	});

	test("leaves the object alone when nothing changes", () => {
		const atMax = { ...base, editorFontSize: FONT_SIZE_RANGE.max };
		expect(zoomPreferences(atMax, 1)).toBe(atMax);
	});

	test("keeps every other preference", () => {
		const next = zoomPreferences(base, 1);
		expect({ ...next, editorFontSize: base.editorFontSize }).toEqual({ ...base });
	});
});
