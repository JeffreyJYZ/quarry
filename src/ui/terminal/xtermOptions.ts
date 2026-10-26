import type { ITerminalOptions } from "@xterm/xterm";
import { XTERM_THEME } from "@/ui/terminal/xtermTheme";

/** The app token `--mono`, repeated because a canvas cannot inherit a CSS variable. */
export const MONO_STACK = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

export const SCROLLBACK = 5000;

/** An empty prop means "the app stack"; the settings page owns any explicit family. */
export function xtermFontFamily(fontFamily: string): string {
	return fontFamily === "" ? MONO_STACK : fontFamily;
}

export function xtermOptions(fontFamily: string, fontSize: number): ITerminalOptions {
	return {
		theme: XTERM_THEME,
		fontFamily: xtermFontFamily(fontFamily),
		fontSize,
		scrollback: SCROLLBACK,
		allowProposedApi: false,
		cursorBlink: true,
	};
}
