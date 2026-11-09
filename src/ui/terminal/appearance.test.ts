import { describe, expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "@/lib/consts/settings";
import type { Preferences } from "@/lib/settings/model";
import { terminalAppearance, type TerminalAppearance } from "@/ui/terminal/appearance";

/**
 * Every appearance preference reaches the emulator.
 *
 * The regression: `useXterm` accepted line height, letter spacing, cursor style, cursor blink and
 * scrollback, and the Settings panel wrote all five, but the terminal panel forwarded only the font
 * size and family — so the controls changed a stored value and nothing on screen.
 */
describe("terminalAppearance", () => {
	test("it carries exactly the five appearance options", () => {
		expect(Object.keys(terminalAppearance(DEFAULT_PREFERENCES)).sort()).toEqual([
			"cursorBlink",
			"cursorStyle",
			"letterSpacing",
			"lineHeight",
			"scrollback",
		]);
	});

	test("every field in the mapping changes when its preference changes", () => {
		const base = terminalAppearance(DEFAULT_PREFERENCES);
		const changes: Record<keyof TerminalAppearance, Preferences[keyof Preferences]> = {
			lineHeight: 1.8,
			letterSpacing: 2,
			cursorStyle: "bar",
			cursorBlink: !DEFAULT_PREFERENCES.terminalCursorBlink,
			scrollback: 9000,
		};
		for (const [field, value] of Object.entries(changes)) {
			expect(
				terminalAppearance({ ...DEFAULT_PREFERENCES, [preferenceFor(field)]: value }),
			).not.toEqual(base);
		}
	});
});

/** The preference that feeds each appearance option. */
function preferenceFor(field: string): keyof typeof DEFAULT_PREFERENCES {
	const map: Record<string, keyof typeof DEFAULT_PREFERENCES> = {
		lineHeight: "terminalLineHeight",
		letterSpacing: "terminalLetterSpacing",
		cursorStyle: "terminalCursorStyle",
		cursorBlink: "terminalCursorBlink",
		scrollback: "terminalScrollback",
	};
	return map[field] as keyof typeof DEFAULT_PREFERENCES;
}
