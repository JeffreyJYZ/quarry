import type { Theme } from "@/lib/themes/model";

/**
 * Ayu Dark, from the ayu-theme palette.
 *
 * Upstream's `#0f1419` canvas is kept, while the panel, rail and border are pushed apart so the
 * rails are visible, and the secondary text is lifted off the upstream comment grey.
 */
export const ayuDark: Theme = {
	id: "ayu-dark",
	name: "Ayu Dark",
	appearance: "dark",
	tokens: {
		bg: "#0f1419",
		panel: "#171d24",
		rail: "#141a21",
		chrome: "#1a212a",
		line: "#2b3441",
		text: "#ece7d5",
		muted: "#b3ad9e",
		accent: "#ffb454",
		hover: "#1f2731",
		danger: "#f07178",
		warn: "#ffb454",
		good: "#aad94c",
		keyword: "#ff8f40",
		type: "#59c2ff",
		string: "#aad94c",
		comment: "#6c7680",
		number: "#d2a6ff",
		function: "#ffb454",
		macro: "#ff8f40",
		operator: "#f29668",
		identifier: "#e6e1cf",
		invalid: "#f07178",
		selection: "#59c2ff33",
		activeLine: "#171d24bf",
		breakpoint: "#f07178",
		error: "#f07178",
		warning: "#ffb454",
		info: "#59c2ff",
		hint: "#b3ad9e",
	},
};
