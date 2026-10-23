import { EditorView } from "@codemirror/view";
import { foldable, foldEffect, indentUnit } from "@codemirror/language";

/** Pairs that an Enter between them splits onto their own indented lines. */
const BRACKET_PAIRS: Record<string, string> = { "{": "}", "(": ")", "[": "]" };

/**
 * Enter between a freshly typed pair expands it into three lines with the caret indented.
 *
 * `closeBrackets` leaves `{|}`, and `insertNewlineAndIndent` alone would only break the line, so the
 * closing half would sit on the caret's line. Returns false for every other position, letting the
 * ordinary newline command run.
 */
export function expandBracketPair(view: EditorView): boolean {
	const { state } = view;
	const selection = state.selection.main;
	if (!selection.empty) return false;
	const before = state.sliceDoc(selection.from - 1, selection.from);
	const after = state.sliceDoc(selection.to, selection.to + 1);
	if (BRACKET_PAIRS[before] !== after) return false;
	const line = state.doc.lineAt(selection.from);
	const baseIndent = /^\s*/.exec(line.text)?.[0] ?? "";
	const unit = state.facet(indentUnit);
	const inner = baseIndent + unit;
	view.dispatch({
		changes: { from: selection.from, to: selection.to, insert: `\n${inner}\n${baseIndent}` },
		selection: { anchor: selection.from + 1 + inner.length },
		userEvent: "input",
	});
	return true;
}

export function foldLevel(view: EditorView, level: number): boolean {
	const state = view.state;
	const effects: unknown[] = [];
	let found = false;
	for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
		const line = state.doc.line(lineNo);
		const info = foldable(state, line.from, line.to);
		if (info === null) continue;
		const indent = line.text.match(/^\\s*/)?.[0].length ?? 0;
		const depth = Math.floor(indent / 4);
		if (depth + 1 > level) continue;
		effects.push(foldEffect.of({ from: info.from, to: info.to }));
		found = true;
	}
	if (!found) return false;
	view.dispatch({ effects: effects as never });
	return true;
}
