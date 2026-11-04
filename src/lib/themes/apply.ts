import { derivedEditorColours } from "@/lib/themes/derive";
import { themeVar, THEME_TOKENS, type Theme, type ThemeTokens } from "@/lib/themes/model";

/**
 * A minimal document root, so the applier can be tested without a browser.
 *
 * `document.documentElement` satisfies it: `CSSStyleDeclaration` has `setProperty` and a
 * `colorScheme` field, and `DOMStringMap` is indexable by name.
 */
export type ThemeRoot = {
	style: { setProperty(name: string, value: string): void; colorScheme: string };
	dataset: Record<string, string | undefined>;
};

/** The custom properties a theme publishes, keyed by variable name. */
export function themeVariables(tokens: ThemeTokens): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const token of THEME_TOKENS) vars[themeVar(token)] = tokens[token];
	return vars;
}

/**
 * Paint a theme: every token becomes a custom property on the document root, plus `data-theme`.
 *
 * The stylesheets never change per theme; they keep consuming `var(--bg)` and friends, which is why
 * a switch is a handful of property writes and repaints immediately.
 */
export function applyTheme(theme: Theme, target: ThemeRoot = document.documentElement): void {
	for (const token of THEME_TOKENS) {
		target.style.setProperty(themeVar(token), theme.tokens[token]);
	}
	// Kinds no theme names: a field, a static field, an enum constant, a constant, a global and a
	// parameter must never look like a local variable, which is the one thing CLion never does.
	const derived = derivedEditorColours(theme.tokens);
	target.style.setProperty("--editor-field", derived.field);
	target.style.setProperty("--editor-parameter", derived.parameter);
	target.style.setProperty("--editor-static-field", derived.staticField);
	target.style.setProperty("--editor-enum-member", derived.enumMember);
	target.style.setProperty("--editor-constant", derived.constant);
	target.style.setProperty("--editor-global", derived.global);
	target.style.setProperty("--editor-label", derived.label);
	target.dataset.theme = theme.id;
	target.style.colorScheme = theme.appearance;
}
