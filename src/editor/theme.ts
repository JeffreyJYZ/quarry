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
