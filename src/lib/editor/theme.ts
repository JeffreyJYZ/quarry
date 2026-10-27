import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorMetrics, palette } from "@/lib/consts/editor";
import { breakpointStyles, foldStyles, lintStyles } from "@/lib/editor/themeStyles";
import { themeVar, type ThemeToken } from "@/lib/themes/model";

/**
 * A syntax or selection token as a CSS variable, falling back to the One Dark constant.
 *
 * `apply.ts` writes `--editor-*` on the document root, so these styles are built once and a theme
 * switch rewrites the variables instead of rebuilding them.
 */
export function hue(token: ThemeToken & keyof typeof palette): string {
	return `var(${themeVar(token)}, ${palette[token]})`;
}

/**
 * The editor skin.
 *
 * Chrome reads the shared `--bg`/`--line`/`--muted` variables; the sizes live in
 * `@/lib/consts/editor` so the theme, the gutter styles and the highlight style cannot drift.
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
			backgroundColor: hue("selection"),
		},
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
			backgroundColor: hue("selection"),
		},
		".cm-activeLine": {
			backgroundColor: hue("activeLine"),
		},
		".cm-gutters": {
			backgroundColor: "var(--bg)",
			color: "var(--muted)",
			border: "none",
			borderRight: "1px solid var(--line)",
		},
		".cm-activeLineGutter": {
			backgroundColor: hue("activeLine"),
			color: "var(--text)",
		},
		".cm-lineNumbers .cm-gutterElement": {
			padding: editorMetrics.gutterPad,
			minWidth: editorMetrics.gutterWidth,
		},
		// A faint tint only: an outline plus a fill read as bright as the caret did.
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: "rgba(116, 173, 232, 0.16)",
			borderRadius: "2px",
			outline: "none",
		},
		".cm-matchingBracket": {
			color: "inherit",
		},
		"&.cm-focused .cm-nonmatchingBracket": {
			backgroundColor: "rgba(208, 114, 119, 0.22)",
			borderRadius: "2px",
			outline: "none",
		},
		".cm-searchMatch": {
			backgroundColor: "rgba(222, 193, 132, 0.25)",
		},
		".cm-searchMatch.cm-searchMatch-selected": {
			backgroundColor: "rgba(222, 193, 132, 0.45)",
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
			backgroundColor: "rgba(116, 173, 232, 0.14)",
		},
		".cm-occurrence-strong": {
			backgroundColor: "rgba(116, 173, 232, 0.26)",
		},
	},
	{ dark: true },
);
