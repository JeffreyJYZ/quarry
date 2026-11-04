import { describe, expect, test } from "bun:test";
import { applyTheme, themeVariables, type ThemeRoot } from "@/lib/themes/apply";
import { DEFAULT_THEME, builtinTheme } from "@/lib/themes/builtin";
import { THEME_TOKENS } from "@/lib/themes/model";

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

describe("applyTheme", () => {
	test("writes every token, the theme id and color-scheme", () => {
		const root = stubRoot();
		const light = builtinTheme("one-light");
		expect(light).not.toBeUndefined();
		if (light === undefined) return;
		applyTheme(light, root);
		// Seven derived variables ride along with the token set: the kinds no theme names.
		expect(Object.keys(root.vars).length).toBe(THEME_TOKENS.length + 7);
		for (const name of [
			"--editor-field",
			"--editor-parameter",
			"--editor-static-field",
			"--editor-enum-member",
			"--editor-constant",
			"--editor-global",
			"--editor-label",
		]) {
			expect(root.vars[name]).toBeDefined();
		}
		expect(root.vars["--bg"]).toBe(light.tokens.bg);
		expect(root.vars["--editor-keyword"]).toBe(light.tokens.keyword);
		expect(root.dataset.theme).toBe("one-light");
		expect(root.style.colorScheme).toBe("light");
	});

	test("themeVariables maps one variable per token", () => {
		expect(Object.keys(themeVariables(DEFAULT_THEME.tokens)).length).toBe(THEME_TOKENS.length);
	});
});
