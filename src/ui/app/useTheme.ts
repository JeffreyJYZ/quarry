import { useEffect, useMemo } from "react";
import type { Preferences } from "@/lib/settings/model";
import { applyTheme } from "@/lib/themes/apply";
import { BUILTIN_THEMES, DEFAULT_THEME } from "@/lib/themes/builtin";
import type { Theme } from "@/lib/themes/model";

/**
 * The theme the app is wearing, and the one effect that paints it.
 *
 * Built-ins and imported themes share one list; an id that resolves to nothing (a theme deleted in
 * another window, a hand-edited settings file) falls back to the default instead of leaving the
 * shell unpainted. Applying happens here rather than in a component so every consumer of
 * `useSettings` gets a live theme, and a switch repaints without a reload.
 */
export function useTheme(preferences: Preferences): Theme {
	const themes = useMemo<Theme[]>(
		() => [...BUILTIN_THEMES, ...preferences.customThemes],
		[preferences.customThemes],
	);
	const theme = useMemo<Theme>(() => {
		const found = themes.find((entry) => entry.id === preferences.theme);
		return found ?? DEFAULT_THEME;
	}, [themes, preferences.theme]);
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);
	return theme;
}
