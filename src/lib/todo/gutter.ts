import {
	type EditorState,
	type Extension,
	RangeSet,
	StateEffect,
	StateField,
} from "@codemirror/state";
import { type BlockInfo, type EditorView, GutterMarker, gutter } from "@codemirror/view";
import { type TodoComment, todoTooltip } from "./lines";

const EMPTY: readonly TodoComment[] = [];

/** Replaces the whole marker set in one transaction; never touches the document. */
export const setTodoComments = StateEffect.define<readonly TodoComment[]>();

/** The markers live in editor state, so a keystroke is one dispatch and never a rebuilt view. */
export const todoCommentField = StateField.define<readonly TodoComment[]>({
	create: () => EMPTY,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setTodoComments)) next = effect.value;
		}
		return next;
	},
});

/** One square per marked line: a `TODO` in the gutter, the way CLion draws a comment marker. */
class TodoMarker extends GutterMarker {
	readonly marker: TodoComment;

	constructor(marker: TodoComment) {
		super();
		this.marker = marker;
	}

	eq(other: GutterMarker): boolean {
		return (
			other instanceof TodoMarker &&
			other.marker.line === this.marker.line &&
			other.marker.kind === this.marker.kind &&
			other.marker.text === this.marker.text
		);
	}

	toDOM(): Node {
		const dot = document.createElement("span");
		dot.className = "cm-todo-marker";
		dot.title = todoTooltip(this.marker);
		dot.setAttribute("role", "img");
		dot.setAttribute("aria-label", todoTooltip(this.marker));
		return dot;
	}
}

/** The gutter's ranges for the live document; a line the document no longer has is skipped. */
export function todoMarkerRanges(
	state: EditorState,
): { from: number; to: number; value: GutterMarker }[] {
	const doc = state.doc;
	const ranges: { from: number; to: number; value: GutterMarker }[] = [];
	for (const marker of state.field(todoCommentField)) {
		if (marker.line < 1 || marker.line > doc.lines) continue;
		const from = doc.line(marker.line).from;
		ranges.push({ from, to: from, value: new TodoMarker(marker) });
	}
	return ranges;
}

/** The marker on the line holding `pos`, or null on an unmarked line. */
export function todoAt(state: EditorState, pos: number): TodoComment | null {
	const line = state.doc.lineAt(pos).number;
	return state.field(todoCommentField).find((marker) => marker.line === line) ?? null;
}

/**
 * The click's body, exported so a test can drive exactly what the gutter runs.
 *
 * Returns whether the click landed on a marker; a click on the column's empty rows is not one, so
 * the editor keeps its default behaviour there.
 */
export function openTodoAt(
	state: EditorState,
	pos: number,
	open: (marker: TodoComment) => void,
): boolean {
	const marker = todoAt(state, pos);
	if (marker === null) return false;
	open(marker);
	return true;
}

/**
 * The TODO column: one marker per marked line.
 *
 * Mounted through a compartment, so a file with no markers keeps no empty gutter beside the line
 * numbers; `open` receives the marker whose line was clicked.
 */
export function todoGutter(open: (marker: TodoComment) => void): Extension {
	return [
		todoCommentField,
		gutter({
			class: "cm-todo-gutter",
			markers: (view: EditorView) => RangeSet.of(todoMarkerRanges(view.state), true),
			domEventHandlers: {
				mousedown(view: EditorView, block: BlockInfo, event: Event): boolean {
					if (!(event instanceof MouseEvent) || event.button !== 0) return false;
					if (!openTodoAt(view.state, block.from, open)) return false;
					event.preventDefault();
					return true;
				},
			},
		}),
	];
}
