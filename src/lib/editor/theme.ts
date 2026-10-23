import { HighlightStyle } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { editorMetrics, palette } from "@/lib/consts/editor";
import { breakpointStyles, foldStyles, lintStyles } from "@/lib/editor/themeStyles";

/**
 * The editor skin.
 *
 * Colour and size constants live in `@/lib/consts/editor`, so the theme, the gutter styles and the
 * highlight style all read the same numbers.
 */
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
			lineHeight: editorMetrics.lineHeight,
		},
		".cm-content": {
			caretColor: "var(--text)",
		},
		// The caret is the brightest thing in the editor: bracket marks stay a tint so the two can
		// never be confused for one another.
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: "var(--text)",
			borderLeftWidth: "2px",
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
			padding: editorMetrics.gutterPad,
			minWidth: editorMetrics.gutterWidth,
		},
		// A faint tint only: an outline plus a fill read as bright as the caret did.
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: "rgba(91, 141, 239, 0.16)",
			borderRadius: "2px",
			outline: "none",
		},
		".cm-matchingBracket": {
			color: "inherit",
		},
		"&.cm-focused .cm-nonmatchingBracket": {
			backgroundColor: "rgba(217, 139, 139, 0.22)",
			borderRadius: "2px",
			outline: "none",
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
		// Hover content is Markdown, so it gets document typography rather than the editor monospace.
		".hover-md": {
			maxWidth: editorMetrics.hoverMaxWidth,
			padding: "8px 10px",
			fontFamily: "var(--ui-font, system-ui, sans-serif)",
			fontSize: "12px",
			lineHeight: "1.5",
			whiteSpace: "normal",
		},
		".hover-md-heading": {
			margin: "0 0 4px",
			fontSize: "12.5px",
			fontWeight: "600",
		},
		".hover-md-paragraph": {
			margin: "0 0 6px",
		},
		".hover-md-list": {
			margin: "0 0 6px",
			paddingLeft: "18px",
		},
		".hover-md-code": {
			padding: "0 4px",
			borderRadius: "3px",
			backgroundColor: "var(--hover)",
			fontFamily: "var(--mono)",
			fontSize: "11.5px",
		},
		".hover-md-block": {
			margin: "0 0 6px",
			padding: "6px 8px",
			borderRadius: "5px",
			backgroundColor: "var(--bg)",
			border: "1px solid var(--line)",
			fontFamily: "var(--mono)",
			fontSize: "11.5px",
			whiteSpace: "pre",
			overflowX: "auto",
		},
		...lintStyles,
		...breakpointStyles,
		...foldStyles,
		".cm-occurrence": {
			backgroundColor: "rgba(91, 141, 239, 0.14)",
		},
		".cm-occurrence-strong": {
			backgroundColor: "rgba(91, 141, 239, 0.26)",
		},
	},
	{ dark: true },
);

/** Syntax colours: each tag family maps to one hue from the shared palette. */
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
