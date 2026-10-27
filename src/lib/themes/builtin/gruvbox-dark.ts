import type { Theme } from "@/lib/themes/model";

/**
 * Gruvbox Dark, from morhetz/gruvbox.
 *
 * `#282828` stays the canvas; the foreground moves from `#ebdbb2` to `#f2e5bc` and the border from
 * `#504945` to `#5a524c`, which is the upstream ramp shifted one step for legibility.
 */
export const gruvboxDark: Theme = {
	id: "gruvbox-dark",
	name: "Gruvbox Dark",
	appearance: "dark",
	tokens: {
		bg: "#282828",
		panel: "#32302f",
		rail: "#2e2c2b",
		chrome: "#3c3836",
		line: "#5a524c",
		text: "#f2e5bc",
		muted: "#bdae93",
		accent: "#83a598",
		hover: "#453f3a",
		danger: "#fb4934",
		warn: "#fabd2f",
		good: "#b8bb26",
		keyword: "#fb4934",
		type: "#fabd2f",
		string: "#b8bb26",
		comment: "#928374",
		number: "#d3869b",
		function: "#8ec07c",
		macro: "#fe8019",
		operator: "#a89984",
		identifier: "#ebdbb2",
		invalid: "#fb4934",
		selection: "#83a59833",
		activeLine: "#32302fbf",
		breakpoint: "#fb4934",
		error: "#fb4934",
		warning: "#fabd2f",
		info: "#83a598",
		hint: "#bdae93",
	},
};
