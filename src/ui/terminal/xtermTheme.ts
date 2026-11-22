import { XTERM_THEME as BASE_THEME, type TerminalPalette } from "@/lib/consts/themes";

/**
 * xterm in Zed's One Dark, so the terminal matches the editor beside it.
 *
 * The palette itself lives in `@/lib/consts/themes` with the rest of the theme literals. Its own
 * background is a third shade, and xterm writes it onto the viewport as an inline style, so a CSS
 * rule cannot flatten the pane. Read the pane token instead: the body, chrome and emulator then
 * paint the same surface from one source.
 */
export function xtermTheme(): TerminalPalette {
	if (typeof document === "undefined") return BASE_THEME;
	const panel = getComputedStyle(document.documentElement).getPropertyValue("--panel").trim();
	return panel === "" ? BASE_THEME : { ...BASE_THEME, background: panel };
}
