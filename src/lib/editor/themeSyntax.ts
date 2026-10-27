import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { hue } from "@/lib/editor/theme";

/**
 * Syntax colours: each tag family maps to one theme token.
 *
 * The values are CSS variables, so the highlight style is built once and a theme switch only
 * rewrites the variables on the document root. The constant behind each variable is the first-paint
 * fallback in `@/lib/consts/editor`.
 */
export const quarryHighlightStyle: HighlightStyle = HighlightStyle.define([
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
		color: hue("comment"),
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
		color: hue("keyword"),
	},
	{
		tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)],
		color: hue("type"),
	},
	{
		tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character],
		color: hue("string"),
	},
	{ tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null], color: hue("number") },
	{
		tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket],
		color: hue("operator"),
	},
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
		color: hue("function"),
	},
	{
		tag: [tags.variableName, tags.propertyName, tags.attributeName],
		color: hue("identifier"),
	},
	{
		tag: [tags.self, tags.standard(tags.variableName), tags.constant(tags.variableName)],
		color: hue("macro"),
	},
	{
		tag: [tags.meta, tags.annotation, tags.processingInstruction, tags.documentMeta],
		color: hue("macro"),
	},
	{ tag: tags.invalid, color: hue("invalid") },
	{ tag: tags.strong, fontWeight: "600" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
]);
