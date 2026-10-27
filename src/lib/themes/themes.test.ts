import { describe, expect, test } from "bun:test";
import { applyTheme, themeVariables, type ThemeRoot } from "@/lib/themes/apply";
import { BUILTIN_THEMES, DEFAULT_THEME, builtinTheme } from "@/lib/themes/builtin";
import {
	DEFAULT_THEME_ID,
	isHexColor,
	normalizeTheme,
	THEME_TOKENS,
	themeSlug,
	themeVar,
} from "@/lib/themes/model";
import { parseThemeJson } from "@/lib/themes/parse";
import { normalizeThemePreferences } from "@/lib/themes/preferences";

const ZED_FILE = JSON.stringify({
	name: "Pasted",
	themes: [
		{
			name: "Night Owl",
			appearance: "dark",
			style: {
				background: "#011627ff",
				"panel.background": "#0b2942",
				"element.background": "#0b2942",
				"border.variant": "#5f7e97",
				text: "#d6deeb",
				"text.muted": "#8badc1",
				"text.accent": "#82aaff",
				"editor.background": "#010e1a",
				"editor.foreground": "#d6deeb",
				error: "#ef5350",
				warning: "#ecc48d",
				success: "#22da6e",
				syntax: {
					keyword: { color: "#c792ea" },
					string: { color: "#ecc48d" },
					nonsense: { color: "#123456" },
				},
			},
		},
		{ name: "Night Owl Light", appearance: "light", style: { background: "#ffffff" } },
	],
});

function stubRoot(): ThemeRoot & { vars: Record<string, string> } {
	const vars: Record<string, string> = {};
	return {
		vars,
		style: {
			setProperty(name: string, value: string) {
				vars[name] = value;
			},
			colorScheme: "",
		},
		dataset: {},
	};
}

describe("the built-in catalogue", () => {
	test("every built-in fills every token with a hex colour", () => {
		expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(8);
		for (const theme of BUILTIN_THEMES) {
			expect(Object.keys(theme.tokens).sort()).toEqual([...THEME_TOKENS].sort());
			for (const token of THEME_TOKENS) expect(isHexColor(theme.tokens[token])).toBe(true);
		}
	});

	test("default is One Dark", () => {
		expect(DEFAULT_THEME_ID).toBe("one-dark");
		expect(DEFAULT_THEME.id).toBe(DEFAULT_THEME_ID);
		expect(builtinTheme(DEFAULT_THEME_ID)).toBe(DEFAULT_THEME);
	});
});

describe("the token model", () => {
	test("chromium tokens keep the short names and editor tokens are prefixed", () => {
		expect(themeVar("bg")).toBe("--bg");
		expect(themeVar("keyword")).toBe("--editor-keyword");
		expect(themeVar("error")).toBe("--lint-error");
	});

	test("slugs are stable and never empty", () => {
		expect(themeSlug("Night Owl")).toBe("night-owl");
		expect(themeSlug("  ***  ")).toBe("imported-theme");
	});
});

describe("applyTheme", () => {
	test("writes every token, the theme id and color-scheme", () => {
		const root = stubRoot();
		const light = builtinTheme("one-light");
		expect(light).not.toBeUndefined();
		if (light === undefined) return;
		applyTheme(light, root);
		expect(Object.keys(root.vars).length).toBe(THEME_TOKENS.length);
		expect(root.vars["--bg"]).toBe(light.tokens.bg);
		expect(root.vars["--editor-keyword"]).toBe(light.tokens.keyword);
		expect(root.dataset.theme).toBe("one-light");
		expect(root.style.colorScheme).toBe("light");
	});

	test("themeVariables maps one variable per token", () => {
		expect(Object.keys(themeVariables(DEFAULT_THEME.tokens)).length).toBe(THEME_TOKENS.length);
	});
});

describe("parseThemeJson", () => {
	test("imports every theme in a Zed file", () => {
		const result = parseThemeJson(ZED_FILE);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.themes.length).toBe(2);
		const [night, light] = result.themes;
		expect(night?.id).toBe("night-owl");
		expect(night?.appearance).toBe("dark");
		expect(night?.tokens.bg).toBe("#010e1a");
		expect(night?.tokens.panel).toBe("#0b2942");
		expect(night?.tokens.line).toBe("#5f7e97");
		expect(night?.tokens.keyword).toBe("#c792ea");
		expect(night?.tokens.error).toBe("#ef5350");
		expect(night?.tokens.good).toBe("#22da6e");
		// A token the file never mentions keeps the default.
		expect(night?.tokens.breakpoint).toBe(DEFAULT_THEME.tokens.breakpoint);
		expect(light?.appearance).toBe("light");
	});

	test("imports a quarry theme and falls back for missing tokens", () => {
		const result = parseThemeJson(
			JSON.stringify({ name: "Slate", tokens: { bg: "#101318", keyword: "#ff79c6" } }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.themes[0]?.id).toBe("slate");
		expect(result.themes[0]?.tokens.bg).toBe("#101318");
		expect(result.themes[0]?.tokens.keyword).toBe("#ff79c6");
		expect(result.themes[0]?.tokens.text).toBe(DEFAULT_THEME.tokens.text);
	});

	test("an import never shadows a built-in id", () => {
		const result = parseThemeJson(JSON.stringify({ name: "Nord", tokens: { bg: "#000000" } }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.themes[0]?.id).toBe("nord-2");
	});

	test("an invalid hex is an error naming the key", () => {
		const result = parseThemeJson(
			JSON.stringify({ name: "Bad", tokens: { keyword: "purple" } }),
		);
		expect(result).toEqual({ ok: false, error: 'invalid hex for "keyword": "purple"' });
	});

	test("bad input never throws", () => {
		expect(parseThemeJson("{not json").ok).toBe(false);
		expect(parseThemeJson("[]").ok).toBe(false);
		expect(parseThemeJson("{}").ok).toBe(false);
		expect(parseThemeJson('{"name":"Empty","tokens":{}}').ok).toBe(true);
	});
});

describe("normalizeTheme", () => {
	test("drops a nameless theme and clamps an unknown appearance", () => {
		expect(normalizeTheme({ tokens: {} }, DEFAULT_THEME.tokens)).toBeNull();
		const theme = normalizeTheme(
			{ name: "Kept", appearance: "sepia", tokens: { bg: "#123456", bogus: "#fff" } },
			DEFAULT_THEME.tokens,
		);
		expect(theme?.appearance).toBe("dark");
		expect(theme?.tokens.bg).toBe("#123456");
	});
});

describe("normalizeThemePreferences", () => {
	test("an old settings file loads with the default theme", () => {
		const preferences = normalizeThemePreferences({ editorFontSize: 13 });
		expect(preferences.theme).toBe(DEFAULT_THEME_ID);
		expect(preferences.customThemes).toEqual([]);
	});

	test("keeps an imported selection and drops a stale id", () => {
		const custom = {
			name: "Slate",
			id: "slate",
			appearance: "dark",
			tokens: DEFAULT_THEME.tokens,
		};
		const kept = normalizeThemePreferences({ theme: "slate", customThemes: [custom] });
		expect(kept.theme).toBe("slate");
		expect(kept.customThemes.length).toBe(1);
		expect(normalizeThemePreferences({ theme: "gone" }).theme).toBe(DEFAULT_THEME_ID);
		expect(normalizeThemePreferences({ theme: "nord" }).theme).toBe("nord");
	});
});
