import { themeVar } from "@/lib/themes/model";

/**
 * The stopped line: a tint with an accent bar and an arrow in its own narrow column.
 *
 * The arrow is a different shape from the breakpoint dot and sits in a separate column, so a stop
 * can never be read as a set breakpoint. Both colours are theme tokens, so light and dark agree.
 */
export const stopLineStyles = {
	".cm-stop-gutter": {
		width: "1.1em",
		"& .cm-gutterElement": {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "0",
		},
	},
	".cm-stop-arrow": {
		color: `var(${themeVar("accent")}, #8bb8f0)`,
		fontSize: "8px",
		lineHeight: "1",
	},
	".cm-stop-line": {
		backgroundColor: "rgba(139, 184, 240, 0.18)",
		boxShadow: `inset 2px 0 0 0 var(${themeVar("accent")}, #8bb8f0)`,
	},
} as const;
