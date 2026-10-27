import { BUILTIN_THEMES, DEFAULT_THEME } from "@/lib/themes/builtin";
import { DEFAULT_THEME_ID, readCustomThemes, type Theme } from "@/lib/themes/model";

/**
 * Theme selection as it lives in the settings file.
 *
 * Both fields are optional on disk: a file written before themes existed simply has neither, and
 * normalising fills the default in. The types live here rather than in `@/lib/settings/model` to
 * keep that module inside the file-size limit.
 */
export type ThemePreferences = {
	/** Id of the active theme: a built-in slug or an imported one. */
	theme: string;
	/** Themes the user pasted in; they shadow nothing built in and can be deleted. */
	customThemes: Theme[];
};

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
	theme: DEFAULT_THEME_ID,
	customThemes: [],
};

/** A stale or misspelled id resolves to the default instead of leaving the app unpainted. */
export function normalizeThemePreferences(source: Record<string, unknown>): ThemePreferences {
	const customThemes = readCustomThemes(source.customThemes, DEFAULT_THEME.tokens);
	const wanted =
		typeof source.theme === "string" && source.theme.trim() !== ""
			? source.theme.trim()
			: DEFAULT_THEME_ID;
	const known =
		BUILTIN_THEMES.some((theme) => theme.id === wanted) ||
		customThemes.some((theme) => theme.id === wanted);
	return { theme: known ? wanted : DEFAULT_THEME_ID, customThemes };
}
