import type { ITerminalOptions, Terminal } from "@xterm/xterm";
import type { Preferences } from "@/lib/settings/model";
import type { TerminalCursorStyle } from "@/lib/settings/terminal";
import { XTERM_THEME } from "@/ui/terminal/xtermTheme";

/** The app token `--mono`, repeated because a canvas cannot inherit a CSS variable. */
export const MONO_STACK = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

export const SCROLLBACK = 5000;

/** An empty prop means "the app stack"; the settings page owns any explicit family. */
export function xtermFontFamily(fontFamily: string): string {
	return fontFamily === "" ? MONO_STACK : fontFamily;
}

/** The live terminal appearance, derived from user preferences. */
export type XtermAppearance = {
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	letterSpacing: number;
	cursorStyle: TerminalCursorStyle;
	cursorBlink: boolean;
	scrollback: number;
};

export function terminalAppearance(prefs: Preferences): XtermAppearance {
	return {
		fontFamily: prefs.terminalFontFamily,
		fontSize: prefs.terminalFontSize,
		lineHeight: prefs.terminalLineHeight,
		letterSpacing: prefs.terminalLetterSpacing,
		cursorStyle: prefs.terminalCursorStyle,
		cursorBlink: prefs.terminalCursorBlink,
		scrollback: prefs.terminalScrollback,
	};
}

export function xtermOptions(appearance: XtermAppearance): ITerminalOptions {
	return {
		theme: XTERM_THEME,
		fontFamily: xtermFontFamily(appearance.fontFamily),
		fontSize: appearance.fontSize,
		lineHeight: appearance.lineHeight,
		letterSpacing: appearance.letterSpacing,
		cursorStyle: appearance.cursorStyle,
		cursorBlink: appearance.cursorBlink,
		scrollback: appearance.scrollback,
		allowProposedApi: false,
	};
}

/** Apply the live appearance onto a running emulator without recreating it. */
export function applyXtermAppearance(term: Terminal, appearance: XtermAppearance): void {
	term.options.fontFamily = xtermFontFamily(appearance.fontFamily);
	term.options.fontSize = appearance.fontSize;
	term.options.lineHeight = appearance.lineHeight;
	term.options.letterSpacing = appearance.letterSpacing;
	term.options.cursorStyle = appearance.cursorStyle;
	term.options.cursorBlink = appearance.cursorBlink;
	term.options.scrollback = appearance.scrollback;
}
