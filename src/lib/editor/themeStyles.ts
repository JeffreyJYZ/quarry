import { breakpointColor, lint } from "@/lib/consts/editor";
import { themeVar } from "@/lib/themes/model";

/** Inline SVG data helpers: the lint package wants a CSS image, not a class. */

function svgUrl(content: string): string {
	return `url("data:image/svg+xml,${encodeURIComponent(content)}")`;
}

/**
 * A lint colour as a CSS variable.
 *
 * Only plain declarations can take a variable: `squiggle`/`marker` below bake a colour into an SVG
 * data URI, where `var()` is not resolved, so those keep the One Dark constant.
 */
function lintHue(token: "error" | "warning" | "info" | "hint"): string {
	return `var(${themeVar(token)}, ${lint[token]})`;
}

/** The hairline squiggle the lint package repeats under an underlined range. */
function squiggle(color: string): string {
	return svgUrl(
		`<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${color}" fill="none" stroke-width=".7"/></svg>`,
	);
}

/** A filled gutter marker; the lint package ships its own default shapes per severity. */
function marker(fill: string, stroke: string, shape: string): string {
	return svgUrl(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round" d="${shape}"/></svg>`,
	);
}

/** Severity styling for inline ranges, gutter markers and the lint tooltip. */
export const lintStyles = {
	".cm-lintRange-error": { backgroundImage: squiggle(lint.error) },
	".cm-lintRange-warning": { backgroundImage: squiggle(lint.warning) },
	".cm-lintRange-info": { backgroundImage: squiggle(lint.info) },
	".cm-lintRange-hint": { backgroundImage: squiggle(lint.hint) },
	".cm-lintRange-active": { backgroundColor: "rgba(229, 192, 123, 0.18)" },
	".cm-lint-marker-error": {
		content: marker(lint.error, "#a64d55", "M20 5a15 15 0 1 0 0 30a15 15 0 1 0 0-30"),
	},
	".cm-lint-marker-warning": { content: marker(lint.warning, "#a8905a", "M20 6L37 35L3 35Z") },
	".cm-lint-marker-info": { content: marker(lint.info, "#3f7fae", "M6 6L34 6L34 34L6 34Z") },
	".cm-lint-marker-hint": { content: marker(lint.hint, "#5b626b", "M20 8L32 20L20 32L8 20Z") },
	".cm-gutter-lint": {
		width: "1.2em",
		"& .cm-gutterElement": {
			padding: "0 2px 0 4px",
		},
	},
	".cm-tooltip-lint": {
		padding: "2px 0",
		maxHeight: "40vh",
		overflowY: "auto",
	},
	".cm-diagnostic": {
		fontSize: "12px",
		fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
	},
	".cm-diagnostic-error": { borderLeftColor: lintHue("error") },
	".cm-diagnostic-warning": { borderLeftColor: lintHue("warning") },
	".cm-diagnostic-info": { borderLeftColor: lintHue("info") },
	".cm-diagnostic-hint": { borderLeftColor: lintHue("hint") },
	".cm-diagnosticSource": { color: "var(--muted)", opacity: 1 },
} as const;

/** Fold markers, the placeholder chip and the gutter they sit in. */
export const foldStyles = {
	".cm-foldGutter": {
		width: "1em",
		"& .cm-gutterElement": {
			padding: "0",
			textAlign: "center",
		},
		"& .cm-gutterElement:empty": {
			display: "none",
		},
	},
	".cm-foldMarker": {
		color: "var(--muted)",
		cursor: "pointer",
		fontSize: "12px",
		lineHeight: "1",
	},
	".cm-foldPlaceholder": {
		backgroundColor: "rgba(255, 255, 255, 0.06)",
		border: "1px solid var(--line)",
		borderRadius: "3px",
		color: "var(--muted)",
		padding: "0 4px",
		margin: "0 2px",
		fontSize: "12px",
	},
} as const;

/** The breakpoint gutter: a filled dot, or a hollow one while the runtime has not confirmed it. */
export const breakpointStyles = {
	".cm-breakpoint-gutter": {
		width: "1.9em",
		cursor: "pointer",
		/* The whole column is the target, so hovering anywhere in it reads as clickable. */
		"&:hover": {
			backgroundColor: "var(--hover)",
		},
		"& .cm-gutterElement": {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "0",
		},
	},
	".cm-breakpoint-dot": {
		width: "9px",
		height: "9px",
		boxSizing: "border-box",
		borderRadius: "50%",
		backgroundColor: `var(${themeVar("breakpoint")}, ${breakpointColor})`,
	},
	".cm-breakpoint-dot.unverified": {
		backgroundColor: "transparent",
		border: `1px solid var(${themeVar("breakpoint")}, ${breakpointColor})`,
		opacity: 0.65,
	},
} as const;
