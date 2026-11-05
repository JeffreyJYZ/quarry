/**
 * Every theme literal the app ships: the token list, the built-in ramp, the default and the xterm
 * palette that follows the editor.
 *
 * The model and the settings module import these, so a new token or theme is added here once.
 */

import { ayuDark } from "@/lib/themes/builtin/ayu-dark";
import { catppuccinMocha } from "@/lib/themes/builtin/catppuccin-mocha";
import { gruvboxDark } from "@/lib/themes/builtin/gruvbox-dark";
import { nord } from "@/lib/themes/builtin/nord";
import { oneDark } from "@/lib/themes/builtin/one-dark";
import { oneLight } from "@/lib/themes/builtin/one-light";
import { solarizedDark } from "@/lib/themes/builtin/solarized-dark";
import { tokyoNight } from "@/lib/themes/builtin/tokyo-night";
import type { Theme } from "@/lib/themes/model";
import type { ThemePreferences } from "@/lib/themes/preferences";

export const THEME_TOKENS = [
	"bg",
	"panel",
	"rail",
	"chrome",
	"line",
	"text",
	"muted",
	"accent",
	"hover",
	"danger",
	"warn",
	"good",
	"keyword",
	"type",
	"string",
	"comment",
	"number",
	"function",
	"macro",
	"operator",
	"identifier",
	"invalid",
	"selection",
	"activeLine",
	"breakpoint",
	"error",
	"warning",
	"info",
	"hint",
] as const;

/** One Dark is the default, and also what `1-root.css` keeps as its first-paint fallback. */
export const DEFAULT_THEME_ID = "one-dark";

/**
 * The themes that ship with the app, in picker order.
 *
 * One Dark comes first because it is the default; every one of them has had the same contrast pass,
 * so no entry is the washed-out upstream ramp.
 */
export const BUILTIN_THEMES: Theme[] = [
	oneDark,
	oneLight,
	ayuDark,
	gruvboxDark,
	nord,
	tokyoNight,
	solarizedDark,
	catppuccinMocha,
];

/** The fallback every importer fills missing tokens from, and the theme a bad id resolves to. */
export const DEFAULT_THEME: Theme = oneDark;

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
	theme: DEFAULT_THEME_ID,
	customThemes: [],
};

/**
 * The xterm palette shape.
 *
 * Declared structurally rather than imported from `@xterm/xterm`: the docs site builds `website/`
 * against `src/lib` through the `@/` alias and has no xterm dependency, so an import here broke its
 * type check. `xterm` accepts this structurally where the palette is handed over.
 */
export type TerminalPalette = {
	background: string;
	foreground: string;
	cursor: string;
	cursorAccent: string;
	selectionBackground: string;
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
};

/**
 * xterm in Zed's One Dark, so the terminal matches the editor beside it.
 *
 * The ANSI names are One Dark's own terminal palette rather than a guess: the bright variants are
 * the ones that theme ships, which is why they are not simply lightened.
 */
export const XTERM_THEME: TerminalPalette = {
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
