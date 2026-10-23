/** Editor hues, one home so the theme, its stylesheets and the highlight style cannot drift. */

/** One hue per role, so a Rust or C++ buffer reads at a glance. */
export const palette = {
	keyword: "#c792ea",
	type: "#56b6c2",
	string: "#98c379",
	comment: "#5c6370",
	number: "#d19a66",
	function: "#61afef",
	macro: "#e5c07b",
	operator: "#8a929c",
	identifier: "#d7dbe0",
	invalid: "#e06c75",
	selection: "rgba(91, 141, 239, 0.25)",
	activeLine: "rgba(255, 255, 255, 0.03)",
} as const;

/** Breakpoint dot hue; one colour for set and unverified, the latter hollow. */
export const breakpointColor = "#e06c75";

/** Lint colours, tuned to stay legible on the `#0b0d10` canvas. */
export const lint = {
	error: "#e06c75",
	warning: "#e5c07b",
	info: "#61afef",
	hint: "#7d858f",
} as const;

/** Editor chrome sizes, kept together with their hues. */
export const editorMetrics = {
	lineHeight: "1.5",
	gutterPad: "0 10px 0 14px",
	gutterWidth: "42px",
	foldGutterWidth: "1em",
	breakpointGutterWidth: "1.1em",
	hoverMaxWidth: "560px",
} as const;
