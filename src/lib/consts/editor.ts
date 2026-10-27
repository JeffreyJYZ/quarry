/** Editor hues, one home so the theme, its stylesheets and the highlight style cannot drift. */

/** One hue per role, so a Rust or C++ buffer reads at a glance. */
export const palette = {
	/* Zed's One Dark syntax colours, so the editor matches the theme the user runs. */
	keyword: "#b477cf",
	type: "#6eb4bf",
	string: "#a1c181",
	comment: "#5d636f",
	number: "#bf956a",
	function: "#73ade9",
	macro: "#b477cf",
	operator: "#6eb4bf",
	identifier: "#acb2be",
	invalid: "#d07277",
	selection: "rgba(116, 173, 232, 0.25)",
	activeLine: "rgba(47, 52, 62, 0.75)",
} as const;

/** Breakpoint dot hue; one colour for set and unverified, the latter hollow. */
export const breakpointColor = "#e06c75";

/** Lint colours, One Dark's error/warning/info on the `#282c33` canvas. */
export const lint = {
	error: "#d07277",
	warning: "#dec184",
	info: "#74ade8",
	hint: "#a9afbc",
} as const;

/** Editor chrome sizes, kept together with their hues. */
export const editorMetrics = {
	lineHeight: "1.5",
	gutterPad: "0 10px 0 14px",
	gutterWidth: "42px",
	foldGutterWidth: "1em",
	breakpointGutterWidth: "1.9em",
	hoverMaxWidth: "560px",
} as const;
