import type { Theme } from "@/lib/themes/model";

/**
 * Nord, from nordtheme/nord.
 *
 * Nord's `nord3` border and comment are the same value as the surface below them, so the border
 * keeps `nord3` while the comment is lifted to the brightened `nord3` used across Nord's own ports.
 */
export const nord: Theme = {
	id: "nord",
	name: "Nord",
	appearance: "dark",
	tokens: {
		bg: "#2e3440",
		panel: "#3b4252",
		rail: "#353b49",
		chrome: "#434c5e",
		line: "#4c566a",
		text: "#eceff4",
		muted: "#b6c0d0",
		accent: "#88c0d0",
		hover: "#434c5e",
		danger: "#bf616a",
		warn: "#ebcb8b",
		good: "#a3be8c",
		keyword: "#81a1c1",
		type: "#8fbcbb",
		string: "#a3be8c",
		comment: "#7b88a1",
		number: "#b48ead",
		function: "#88c0d0",
		macro: "#d08770",
		operator: "#81a1c1",
		identifier: "#d8dee9",
		invalid: "#bf616a",
		selection: "#88c0d033",
		activeLine: "#3b4252bf",
		breakpoint: "#bf616a",
		error: "#bf616a",
		warning: "#ebcb8b",
		info: "#88c0d0",
		hint: "#b6c0d0",
	},
};
