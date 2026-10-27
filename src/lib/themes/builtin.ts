import type { Theme } from "@/lib/themes/model";
import { ayuDark } from "./builtin/ayu-dark";
import { catppuccinMocha } from "./builtin/catppuccin-mocha";
import { gruvboxDark } from "./builtin/gruvbox-dark";
import { nord } from "./builtin/nord";
import { oneDark } from "./builtin/one-dark";
import { oneLight } from "./builtin/one-light";
import { solarizedDark } from "./builtin/solarized-dark";
import { tokyoNight } from "./builtin/tokyo-night";

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

export function builtinTheme(id: string): Theme | undefined {
	return BUILTIN_THEMES.find((theme) => theme.id === id);
}
