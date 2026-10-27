import type { Theme } from "@/lib/themes/model";

/**
 * Catppuccin Mocha, from catppuccin/catppuccin.
 *
 * `base` stays the canvas, `mantle` the panel. Ink is `text` lifted one step (`#dce3f9`), muted is
 * `subtext0` lifted the same way, and the border is `surface1` rather than the near-invisible
 * `surface0` the theme uses for its own surfaces.
 */
export const catppuccinMocha: Theme = {
	id: "catppuccin-mocha",
	name: "Catppuccin Mocha",
	appearance: "dark",
	tokens: {
		bg: "#1e1e2e",
		panel: "#181825",
		rail: "#1b1b2a",
		chrome: "#313244",
		line: "#45475a",
		text: "#dce3f9",
		muted: "#b3bad8",
		accent: "#89b4fa",
		hover: "#313244",
		danger: "#f38ba8",
		warn: "#f9e2af",
		good: "#a6e3a1",
		keyword: "#cba6f7",
		type: "#f9e2af",
		string: "#a6e3a1",
		comment: "#7f849c",
		number: "#fab387",
		function: "#89b4fa",
		macro: "#f5c2e7",
		operator: "#89dceb",
		identifier: "#cdd6f4",
		invalid: "#f38ba8",
		selection: "#89b4fa33",
		activeLine: "#313244bf",
		breakpoint: "#f38ba8",
		error: "#f38ba8",
		warning: "#f9e2af",
		info: "#89b4fa",
		hint: "#b3bad8",
	},
};
