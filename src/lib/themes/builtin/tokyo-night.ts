import type { Theme } from "@/lib/themes/model";

/**
 * Tokyo Night, from folke/tokyonight.nvim.
 *
 * `#1a1b26` stays the canvas and `#c0caf5` the ink; the border moves from `#292e42` to `#3b4261`
 * and the comment from `#565f89` to `#67709c`, the upstream ramp one step brighter.
 */
export const tokyoNight: Theme = {
	id: "tokyo-night",
	name: "Tokyo Night",
	appearance: "dark",
	tokens: {
		bg: "#1a1b26",
		panel: "#1f2335",
		rail: "#1c1f2e",
		chrome: "#292e42",
		line: "#3b4261",
		text: "#c8d3f5",
		muted: "#a9b1d6",
		accent: "#7aa2f7",
		hover: "#2a2f45",
		danger: "#f7768e",
		warn: "#e0af68",
		good: "#9ece6a",
		keyword: "#bb9af7",
		type: "#2ac3de",
		string: "#9ece6a",
		comment: "#67709c",
		number: "#ff9e64",
		function: "#7aa2f7",
		macro: "#bb9af7",
		operator: "#89ddff",
		identifier: "#c0caf5",
		invalid: "#f7768e",
		selection: "#7aa2f733",
		activeLine: "#1f2335bf",
		breakpoint: "#f7768e",
		error: "#f7768e",
		warning: "#e0af68",
		info: "#7aa2f7",
		hint: "#a9b1d6",
	},
};
