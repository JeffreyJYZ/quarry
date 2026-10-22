import { HighlightStyle } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** One hue per role, so a Rust or C++ buffer reads at a glance. */
const palette = {
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
const breakpoint = { dot: "#e06c75" } as const;

/** Lint colours, tuned to stay legible on the `#0b0d10` canvas. */
const lint = {
	error: "#e06c75",
	warning: "#e5c07b",
	info: "#61afef",
	hint: "#7d858f",
} as const;

function svgUrl(content: string): string {
	return `url("data:image/svg+xml,${encodeURIComponent(content)}")`;
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

const lintStyles = {
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
	".cm-diagnostic-error": { borderLeftColor: lint.error },
	".cm-diagnostic-warning": { borderLeftColor: lint.warning },
	".cm-diagnostic-info": { borderLeftColor: lint.info },
	".cm-diagnostic-hint": { borderLeftColor: lint.hint },
	".cm-diagnosticSource": { color: "var(--muted)", opacity: 1 },
} as const;

const breakpointStyles = {
	".cm-breakpoint-gutter": {
		width: "1.1em",
		cursor: "pointer",
		"& .cm-gutterElement": {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "0",
		},
	},
	".cm-breakpoint-dot": {
		width: "8px",
		height: "8px",
		boxSizing: "border-box",
		borderRadius: "50%",
		backgroundColor: breakpoint.dot,
	},
	".cm-breakpoint-dot.unverified": {
		backgroundColor: "transparent",
		border: `1px solid ${breakpoint.dot}`,
		opacity: 0.65,
	},
} as const;

export const quarryTheme: Extension = EditorView.theme(
	{
		"&": {
			color: "var(--text)",
			backgroundColor: "var(--bg)",
		},
		"&.cm-focused": {
			outline: "none",
		},
		".cm-scroller": {
			fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
			fontSize: "13px",
			lineHeight: "1.5",
		},
		".cm-content": {
			caretColor: "var(--accent)",
		},
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: "var(--accent)",
		},
		".cm-selectionBackground, .cm-content ::selection": {
			backgroundColor: palette.selection,
		},
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
			backgroundColor: palette.selection,
		},
		".cm-activeLine": {
			backgroundColor: palette.activeLine,
		},
		".cm-gutters": {
			backgroundColor: "var(--bg)",
			color: "var(--muted)",
			border: "none",
			borderRight: "1px solid var(--line)",
		},
		".cm-activeLineGutter": {
			backgroundColor: palette.activeLine,
			color: "var(--text)",
		},
		".cm-lineNumbers .cm-gutterElement": {
			padding: "0 10px 0 14px",
			minWidth: "42px",
		},
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: palette.selection,
			outline: "1px solid var(--accent)",
		},
		".cm-matchingBracket": {
			color: palette.identifier,
		},
		".cm-searchMatch": {
			backgroundColor: "rgba(229, 192, 123, 0.25)",
		},
		".cm-searchMatch.cm-searchMatch-selected": {
			backgroundColor: "rgba(229, 192, 123, 0.45)",
		},
		".cm-panels": {
			backgroundColor: "var(--panel)",
			color: "var(--text)",
			borderTop: "1px solid var(--line)",
		},
		".cm-tooltip": {
			backgroundColor: "var(--panel)",
			border: "1px solid var(--line)",
			color: "var(--text)",
		},
		...lintStyles,
		...breakpointStyles,
	},
	{ dark: true },
);

export const quarryHighlightStyle: HighlightStyle = HighlightStyle.define([
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
		color: palette.comment,
		fontStyle: "italic",
	},
	{
		tag: [
			tags.keyword,
			tags.controlKeyword,
			tags.operatorKeyword,
			tags.definitionKeyword,
			tags.moduleKeyword,
		],
		color: palette.keyword,
	},
	{
		tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)],
		color: palette.type,
	},
	{
		tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character],
		color: palette.string,
	},
	{ tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null], color: palette.number },
	{
		tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket],
		color: palette.operator,
	},
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
		color: palette.function,
	},
	{ tag: [tags.variableName, tags.propertyName, tags.attributeName], color: palette.identifier },
	{
		tag: [tags.self, tags.standard(tags.variableName), tags.constant(tags.variableName)],
		color: palette.macro,
	},
	{
		tag: [tags.meta, tags.annotation, tags.processingInstruction, tags.documentMeta],
		color: palette.macro,
	},
	{ tag: tags.invalid, color: palette.invalid },
	{ tag: tags.strong, fontWeight: "600" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
]);
