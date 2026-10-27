import type { Theme } from "@/lib/themes/model";

/**
 * Solarized Dark, from altercation/solarized.
 *
 * `base03` stays the canvas. Solarized's body ink (`base0`/`base1`) is deliberately low contrast,
 * so text, muted text and the blue accent each move one base step up the same ramp.
 */
export const solarizedDark: Theme = {
	id: "solarized-dark",
	name: "Solarized Dark",
	appearance: "dark",
	tokens: {
		bg: "#002b36",
		panel: "#073642",
		rail: "#06313c",
		chrome: "#0a3f4d",
		line: "#12495a",
		text: "#c6d0cf",
		muted: "#93a1a1",
		accent: "#56b6e8",
		hover: "#0b4050",
		danger: "#dc322f",
		warn: "#b58900",
		good: "#859900",
		keyword: "#859900",
		type: "#b58900",
		string: "#2aa198",
		comment: "#6d8388",
		number: "#d33682",
		function: "#4fb3e8",
		macro: "#cb4b16",
		operator: "#93a1a1",
		identifier: "#c6d0cf",
		invalid: "#dc322f",
		selection: "#268bd233",
		activeLine: "#073642bf",
		breakpoint: "#dc322f",
		error: "#dc322f",
		warning: "#b58900",
		info: "#4fb3e8",
		hint: "#93a1a1",
	},
};
