/**
 * The theme model: one token set every theme fills, plus the CSS variable each token drives.
 *
 * The chrome tokens are the ones `src/ui/styles/1-root.css` already consumes. The editor tokens are
 * published as `--editor-*` and the lint tokens as `--lint-*`, which is what `apply.ts` writes and
 * `src/lib/editor/theme.ts` reads, so a switch repaints the editor without rebuilding its styles.
 */

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

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeTokens = Record<ThemeToken, string>;
export type ThemeAppearance = "dark" | "light";

export type Theme = {
	/** Stable id: a built-in slug, or one derived from an imported name. */
	id: string;
	name: string;
	appearance: ThemeAppearance;
	tokens: ThemeTokens;
};

/** One Dark is the default, and also what `1-root.css` keeps as its first-paint fallback. */
export const DEFAULT_THEME_ID = "one-dark";

const TOKEN_VARS: Record<ThemeToken, string> = {
	bg: "--bg",
	panel: "--panel",
	rail: "--rail",
	chrome: "--chrome",
	line: "--line",
	text: "--text",
	muted: "--muted",
	accent: "--accent",
	hover: "--hover",
	danger: "--danger",
	warn: "--warn",
	good: "--good",
	keyword: "--editor-keyword",
	type: "--editor-type",
	string: "--editor-string",
	comment: "--editor-comment",
	number: "--editor-number",
	function: "--editor-function",
	macro: "--editor-macro",
	operator: "--editor-operator",
	identifier: "--editor-identifier",
	invalid: "--editor-invalid",
	selection: "--editor-selection",
	activeLine: "--editor-active-line",
	breakpoint: "--editor-breakpoint",
	error: "--lint-error",
	warning: "--lint-warning",
	info: "--lint-info",
	hint: "--lint-hint",
};

/** The CSS custom property a token is published as. */
export function themeVar(token: ThemeToken): string {
	return TOKEN_VARS[token];
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
	return typeof value === "string" && HEX_COLOR.test(value);
}

/** Zed writes `#rrggbbff`; drop an opaque alpha so both spellings name the same colour. */
export function normalizeHex(value: string): string {
	return value.length === 9 && value.slice(7).toLowerCase() === "ff" ? value.slice(0, 7) : value;
}

/** An id-safe slug, so a pasted theme cannot collide through whitespace or punctuation alone. */
export function themeSlug(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug === "" ? "imported-theme" : slug;
}

/** A stored or imported theme, or null when it is too broken to keep. */
export function normalizeTheme(input: unknown, fallback: ThemeTokens): Theme | null {
	if (typeof input !== "object" || input === null) return null;
	const source = input as Record<string, unknown>;
	const name = typeof source.name === "string" ? source.name.trim() : "";
	if (name === "") return null;
	const stored =
		typeof source.tokens === "object" && source.tokens !== null
			? (source.tokens as Record<string, unknown>)
			: {};
	const tokens: ThemeTokens = { ...fallback };
	for (const token of THEME_TOKENS) {
		const value = stored[token];
		if (isHexColor(value)) tokens[token] = normalizeHex(value);
	}
	const id =
		typeof source.id === "string" && source.id.trim() !== ""
			? themeSlug(source.id)
			: themeSlug(name);
	const appearance: ThemeAppearance = source.appearance === "light" ? "light" : "dark";
	return { id, name, appearance, tokens };
}

/** Imported themes from the settings file: anything that no longer validates is dropped. */
export function readCustomThemes(value: unknown, fallback: ThemeTokens): Theme[] {
	if (!Array.isArray(value)) return [];
	const themes: Theme[] = [];
	for (const entry of value) {
		const theme = normalizeTheme(entry, fallback);
		if (theme !== null) themes.push(theme);
	}
	return themes;
}
