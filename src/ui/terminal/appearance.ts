import type { Preferences } from "@/lib/settings/model";

/**
 * The terminal settings that describe its appearance.
 *
 * Five of them were persisted and shown in Settings but never reached the emulator: `useXterm` takes
 * them, the panel passed only the font size and family, so the controls did nothing. One mapper, so a
 * new option has one place to be wired and one test that notices when it is not.
 */
export type TerminalAppearance = {
	lineHeight: number;
	letterSpacing: number;
	cursorStyle: Preferences["terminalCursorStyle"];
	cursorBlink: boolean;
	scrollback: number;
};

export function terminalAppearance(preferences: Preferences): TerminalAppearance {
	return {
		lineHeight: preferences.terminalLineHeight,
		letterSpacing: preferences.terminalLetterSpacing,
		cursorStyle: preferences.terminalCursorStyle,
		cursorBlink: preferences.terminalCursorBlink,
		scrollback: preferences.terminalScrollback,
	};
}
