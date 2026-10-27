import type { Theme } from "@/lib/themes/model";

/**
 * One Light, from Atom's One Light palette.
 *
 * Upstream's borders and comments are almost the same value as its canvas, so the contrast pass
 * darkens the border, the secondary text and every hue that was tuned for a darker background.
 */
export const oneLight: Theme = {
	id: "one-light",
	name: "One Light",
	appearance: "light",
	tokens: {
		bg: "#fafafa",
		panel: "#f0f0f1",
		rail: "#ededee",
		chrome: "#e6e6e7",
		line: "#b9bcc2",
		text: "#1f2227",
		muted: "#545a63",
		accent: "#2f62c4",
		hover: "#e4e6e9",
		danger: "#cf2f23",
		warn: "#8a5b00",
		good: "#3d7b2f",
		keyword: "#a626a4",
		type: "#7a5200",
		string: "#3d7b2f",
		comment: "#7d838c",
		number: "#986801",
		function: "#2f62c4",
		macro: "#a626a4",
		operator: "#01678d",
		identifier: "#1f2227",
		invalid: "#cf2f23",
		selection: "#4078f233",
		activeLine: "#f0f0f1cc",
		breakpoint: "#cf2f23",
		error: "#cf2f23",
		warning: "#8a5b00",
		info: "#2f62c4",
		hint: "#545a63",
	},
};
