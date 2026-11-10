import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view";
import {
	type EditorState,
	type Extension,
	RangeSet,
	StateEffect,
	StateField,
} from "@codemirror/state";

/** The 1-based line the debuggee is stopped on, or null while it runs. */
export const setStopLine = StateEffect.define<number | null>();

/** The stopped line lives in editor state, so a stop is one dispatch, never a rebuilt view. */
export const stopLineField = StateField.define<number | null>({
	create: () => null,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setStopLine)) next = effect.value;
		}
		return next;
	},
});

/** A right-pointing arrow: a shape no breakpoint dot shares, in a column of its own. */
class StopArrow extends GutterMarker {
	toDOM(): Node {
		const arrow = document.createElement("span");
		arrow.className = "cm-stop-arrow";
		arrow.title = "Stopped here";
		arrow.textContent = "▶";
		return arrow;
	}
}

const ARROW = new StopArrow();

/** The stopped line, limited to a line the live document really has. */
function liveLine(state: EditorState): number | null {
	const line = state.field(stopLineField);
	if (line === null || line < 1 || line > state.doc.lines) return null;
	return line;
}

/** The gutter's ranges for the live document; a stale line paints nothing, never a neighbour. */
export function stopMarkerRanges(
	state: EditorState,
): { from: number; to: number; value: GutterMarker }[] {
	const line = liveLine(state);
	if (line === null) return [];
	const from = state.doc.line(line).from;
	return [{ from, to: from, value: ARROW }];
}

function tint(state: EditorState): DecorationSet {
	const line = liveLine(state);
	if (line === null) return Decoration.none;
	const start = state.doc.line(line).from;
	return Decoration.set([Decoration.line({ class: "cm-stop-line" }).range(start)], true);
}

/**
 * The tint under the stopped line. It is a decoration set rather than a gutter, so it survives a
 * fold and reads as a place in the code rather than a mark beside it.
 */
const stopTintField = StateField.define<DecorationSet>({
	create: (state) => tint(state),
	update(value, transaction) {
		const before = transaction.startState.field(stopLineField);
		const after = transaction.state.field(stopLineField);
		if (transaction.docChanged || before !== after) return tint(transaction.state);
		return value;
	},
	provide: (field) => EditorView.decorations.from(field),
});

/** The 1-based lines the tint covers; read back for tests and never by the view. */
export function stopDecorationLines(state: EditorState): number[] {
	const lines: number[] = [];
	state.field(stopTintField).between(0, state.doc.length, (from: number) => {
		lines.push(state.doc.lineAt(from).number);
	});
	return lines;
}

/**
 * The line to paint in `path`, or 0 when this editor is not the stopped file.
 *
 * The debug model's own path is compared whole, so a stop in another file paints nothing rather
 * than the same line number in the file on screen.
 */
export function stopLineOf(
	debug: { stopped: boolean; path: string | null; line: number } | null | undefined,
	path: string | null,
): number {
	if (debug === null || debug === undefined || !debug.stopped) return 0;
	if (path === null || debug.path !== path || debug.line < 1) return 0;
	return debug.line;
}

/** The column and the tint; registered once per view and driven through `setStopLine`. */
export const stopLineGutter: Extension = [
	stopLineField,
	stopTintField,
	gutter({
		class: "cm-stop-gutter",
		markers: (view) => RangeSet.of(stopMarkerRanges(view.state), true),
	}),
];
