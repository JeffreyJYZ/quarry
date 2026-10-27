import { BUILTIN_THEMES, DEFAULT_THEME } from "@/lib/themes/builtin";
import {
	isHexColor,
	normalizeHex,
	THEME_TOKENS,
	themeSlug,
	type Theme,
	type ThemeAppearance,
	type ThemeTokens,
	type ThemeToken,
} from "@/lib/themes/model";

/**
 * Theme import from pasted JSON.
 *
 * Two shapes are accepted: a Zed theme file (`{ name, themes: [{ name, style, … }] }`, which may
 * carry several themes) and a quarry theme object (`{ name, tokens }`). Nothing here throws: bad
 * input comes back as `{ ok: false, error }`, unknown keys are ignored, and a missing token keeps
 * the default theme's value for that token.
 */
export type ThemeParseResult = { ok: true; themes: Theme[] } | { ok: false; error: string };

type Fields = Record<string, unknown>;
type ColorRead = { ok: true; value: string | null } | { ok: false; error: string };
type Filled = { ok: true; tokens: ThemeTokens } | { ok: false; error: string };
type ThemeRead = { ok: true; theme: Theme } | { ok: false; error: string };

type ColorSpec = { token: ThemeToken; key: string; label?: string };

/** Zed style keys, in the order they win: the editor's own background beats the app background. */
const ZED_COLORS: ColorSpec[] = [
	{ token: "bg", key: "background" },
	{ token: "bg", key: "editor.background" },
	{ token: "panel", key: "panel.background" },
	{ token: "rail", key: "element.background" },
	{ token: "line", key: "border.variant" },
	{ token: "text", key: "text" },
	{ token: "muted", key: "text.muted" },
	{ token: "accent", key: "text.accent" },
	{ token: "danger", key: "error" },
	{ token: "error", key: "error" },
	{ token: "warn", key: "warning" },
	{ token: "warning", key: "warning" },
	{ token: "good", key: "success" },
	{ token: "identifier", key: "editor.foreground" },
];

/** Zed's `syntax` block: each key is `{ color }`, and a name we do not know is skipped. */
const ZED_SYNTAX: ColorSpec[] = [
	{ token: "keyword", key: "keyword" },
	{ token: "type", key: "type" },
	{ token: "string", key: "string" },
	{ token: "comment", key: "comment" },
	{ token: "number", key: "number" },
	{ token: "function", key: "function" },
	{ token: "macro", key: "preproc" },
	{ token: "operator", key: "operator" },
	{ token: "identifier", key: "variable" },
	{ token: "identifier", key: "property" },
	{ token: "invalid", key: "invalid" },
];

const QUARRY_COLORS: ColorSpec[] = THEME_TOKENS.map((token) => ({ token, key: token }));

function asFields(value: unknown): Fields | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Fields)
		: null;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readColor(source: Fields, key: string, label: string): ColorRead {
	const raw = source[key];
	if (raw === undefined || raw === null) return { ok: true, value: null };
	if (!isHexColor(raw)) {
		return { ok: false, error: `invalid hex for "${label}": ${JSON.stringify(raw)}` };
	}
	return { ok: true, value: normalizeHex(raw) };
}

function fill(source: Fields, specs: ColorSpec[], syntax: Fields | null): Filled {
	const tokens: ThemeTokens = { ...DEFAULT_THEME.tokens };
	for (const spec of specs) {
		const read = readColor(source, spec.key, spec.label ?? spec.key);
		if (!read.ok) return read;
		if (read.value !== null) tokens[spec.token] = read.value;
	}
	if (syntax === null) return { ok: true, tokens };
	for (const spec of ZED_SYNTAX) {
		const entry = asFields(syntax[spec.key]);
		if (entry === null) continue;
		const read = readColor(entry, "color", `syntax.${spec.key}.color`);
		if (!read.ok) return read;
		if (read.value !== null) tokens[spec.token] = read.value;
	}
	return { ok: true, tokens };
}

function readName(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function readAppearance(value: unknown): ThemeAppearance {
	return value === "light" ? "light" : "dark";
}

/** An id no built-in or earlier entry in this paste already owns, so nothing is silently shadowed. */
function uniqueId(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	let index = 2;
	while (taken.has(`${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

function readZedTheme(entry: unknown, index: number, taken: Set<string>): ThemeRead {
	const record = asFields(entry);
	if (record === null) return { ok: false, error: `theme ${index + 1} is not an object` };
	const name = readName(record.name, `Theme ${index + 1}`);
	const style = asFields(record.style);
	if (style === null) return { ok: false, error: `theme "${name}" has no style block` };
	const filled = fill(style, ZED_COLORS, asFields(style.syntax));
	if (!filled.ok) return { ok: false, error: `${name}: ${filled.error}` };
	const id = uniqueId(themeSlug(name), taken);
	return {
		ok: true,
		theme: { id, name, appearance: readAppearance(record.appearance), tokens: filled.tokens },
	};
}

function readQuarryTheme(record: Fields, taken: Set<string>): ThemeRead {
	const tokens = asFields(record.tokens);
	if (tokens === null) return { ok: false, error: '"tokens" must be an object' };
	const filled = fill(tokens, QUARRY_COLORS, null);
	if (!filled.ok) return filled;
	const name = readName(record.name, "Imported theme");
	const base = typeof record.id === "string" && record.id.trim() !== "" ? record.id : name;
	return {
		ok: true,
		theme: {
			id: uniqueId(themeSlug(base), taken),
			name,
			appearance: readAppearance(record.appearance),
			tokens: filled.tokens,
		},
	};
}

export function parseThemeJson(text: string): ThemeParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return { ok: false, error: `not valid JSON: ${message(error)}` };
	}
	try {
		const root = asFields(parsed);
		if (root === null) return { ok: false, error: "expected a JSON object" };
		const taken = new Set(BUILTIN_THEMES.map((theme) => theme.id));
		if (Array.isArray(root.themes)) {
			if (root.themes.length === 0) return { ok: false, error: "the file carries no themes" };
			const themes: Theme[] = [];
			for (const [index, entry] of root.themes.entries()) {
				const read = readZedTheme(entry, index, taken);
				if (!read.ok) return read;
				themes.push(read.theme);
				taken.add(read.theme.id);
			}
			return { ok: true, themes };
		}
		if (root.tokens !== undefined) {
			const read = readQuarryTheme(root, taken);
			return read.ok ? { ok: true, themes: [read.theme] } : read;
		}
		return {
			ok: false,
			error: 'expected a Zed theme file ("themes") or a quarry theme ("tokens")',
		};
	} catch (error) {
		return { ok: false, error: message(error) };
	}
}
