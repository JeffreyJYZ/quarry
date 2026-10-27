import type { ITheme } from "@xterm/xterm";

/**
 * xterm in Zed's One Dark, so the terminal matches the editor beside it.
 *
 * The ANSI names are One Dark's own terminal palette rather than a guess: the bright variants are
 * the ones that theme ships, which is why they are not simply lightened.
 */
export const XTERM_THEME: ITheme = {
	background: "#282c34",
	foreground: "#abb2bf",
	cursor: "#74ade8",
	cursorAccent: "#282c34",
	selectionBackground: "#3e4451",
	black: "#282c34",
	red: "#e06c75",
	green: "#98c379",
	yellow: "#e5c07b",
	blue: "#61afef",
	magenta: "#c678dd",
	cyan: "#56b6c2",
	white: "#abb2bf",
	brightBlack: "#636d83",
	brightRed: "#ea858b",
	brightGreen: "#aad581",
	brightYellow: "#ffd885",
	brightBlue: "#85c1ff",
	brightMagenta: "#d398eb",
	brightCyan: "#6ed5de",
	brightWhite: "#fafafa",
};
