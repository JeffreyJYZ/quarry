import type { Theme } from "@/lib/themes/model";

/**
 * One Dark, the default theme.
 *
 * Hues are Zed's `assets/themes/one/one.json`, but every surface moved one step apart from its
 * neighbour: the upstream background/panel/border/text ramp reads washed out on this display, so
 * the background is darker, the panel and border are lifted, and the text is brighter. Only
 * luminance changed; no hue was invented.
 */
export const oneDark: Theme = {
	id: "one-dark",
	name: "One Dark",
	appearance: "dark",
	tokens: {
		bg: "#23272e",
		panel: "#2c313a",
		rail: "#2a2f37",
		chrome: "#343a45",
		line: "#4a505c",
		text: "#e6e9ee",
		muted: "#b9c0cc",
		accent: "#8bb8f0",
		hover: "#363c47",
		danger: "#e06c75",
		warn: "#e5c07b",
		good: "#98c379",
		keyword: "#b477cf",
		type: "#6eb4bf",
		string: "#a1c181",
		comment: "#6b7480",
		number: "#bf956a",
		function: "#73ade9",
		macro: "#b477cf",
		operator: "#6eb4bf",
		identifier: "#c8ccd4",
		invalid: "#e06c75",
		selection: "#8bb8f040",
		activeLine: "#2c313abf",
		breakpoint: "#e06c75",
		error: "#e06c75",
		warning: "#e5c07b",
		info: "#8bb8f0",
		hint: "#b9c0cc",
	},
};
