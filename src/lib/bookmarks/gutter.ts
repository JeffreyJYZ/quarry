import {
	type EditorState,
	type Extension,
	type Range,
	RangeSet,
	StateEffect,
	StateField,
} from "@codemirror/state";
import {
	BlockInfo,
	Decoration,
	type DecorationSet,
	EditorView,
	GutterMarker,
	gutter,
} from "@codemirror/view";

/** What the bookmark gutter paints, and the click channel back to the caller. */
export type BookmarkMarkers = {
	/** 1-based lines carrying a bookmark, ascending and unique. */
	lines: readonly number[];
	/** Called with a 1-based line when the gutter column is clicked. */
	toggle: (line: number) => void;
};

const EMPTY: BookmarkMarkers = { lines: [], toggle: () => undefined };

/** Replaces the whole marker set in one transaction; never touches the document. */
export const setBookmarks = StateEffect.define<BookmarkMarkers>();

/** Markers live in editor state so a prop change is one dispatch, never a rebuilt view. */
export const bookmarkField = StateField.define<BookmarkMarkers>({
	create: () => EMPTY,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setBookmarks)) next = effect.value;
		}
		return next;
	},
});

/** One ribbon per bookmarked line, drawn in its own column beside the breakpoints. */
class BookmarkRibbon extends GutterMarker {
	readonly line: number;

	constructor(line: number) {
		super();
		this.line = line;
	}

	eq(other: GutterMarker): boolean {
		return other instanceof BookmarkRibbon && other.line === this.line;
	}

	toDOM(): Node {
		const ribbon = document.createElement("span");
		ribbon.className = "cm-bookmark-dot";
		ribbon.title = "Bookmark (click to remove)";
		return ribbon;
	}
}

/**
 * The gutter's ranges for the live document.
 *
 * Line rows shift with the document, so markers are rebuilt from it each call; a stored line that
 * the document no longer has is skipped instead of being clamped onto a neighbour.
 */
export function bookmarkMarkerRanges(
	state: EditorState,
): { from: number; to: number; value: GutterMarker }[] {
	const { lines } = state.field(bookmarkField);
	const doc = state.doc;
	const ranges: { from: number; to: number; value: GutterMarker }[] = [];
	for (const line of lines) {
		if (line < 1 || line > doc.lines) continue;
		const from = doc.line(line).from;
		ranges.push({ from, to: from, value: new BookmarkRibbon(line) });
	}
	return ranges;
}

function lineDecorations(state: EditorState): DecorationSet {
	const { lines } = state.field(bookmarkField);
	const carets = new Set<number>();
	for (const range of state.selection.ranges) {
		carets.add(state.doc.lineAt(range.head).number);
	}
	const decorations: Range<Decoration>[] = [];
	for (const line of lines) {
		if (!carets.has(line) || line < 1 || line > state.doc.lines) continue;
		const start = state.doc.line(line).from;
		decorations.push(Decoration.line({ class: "cm-bookmark-line" }).range(start));
	}
	return Decoration.set(decorations, true);
}

/**
 * The tint under the caret's line, which is what tells a user the bookmark is on this line rather
 * than merely somewhere in the file. It is a decoration set, not a gutter, so it survives folds.
 */
export const bookmarkLineField = StateField.define<DecorationSet>({
	create: (state) => lineDecorations(state),
	update(value, transaction) {
		const before = transaction.startState.field(bookmarkField);
		const after = transaction.state.field(bookmarkField);
		if (transaction.docChanged || transaction.selection || before !== after) {
			return lineDecorations(transaction.state);
		}
		return value.map(transaction.changes);
	},
	provide: (field) => EditorView.decorations.from(field),
});

/** The 1-based lines currently tinted, read back for tests and never by the view. */
export function highlightedLines(state: EditorState): number[] {
	const lines: number[] = [];
	state.field(bookmarkLineField).between(0, state.doc.length, (from: number) => {
		lines.push(state.doc.lineAt(from).number);
	});
	return lines;
}

/**
 * The bookmark column. Only this column toggles, and a click on a line already carrying a bookmark
 * removes it, which is the same gesture the tool window's remove row mirrors.
 */
export const bookmarkGutter: Extension = [
	bookmarkField,
	bookmarkLineField,
	gutter({
		class: "cm-bookmark-gutter",
		markers: (view) => RangeSet.of(bookmarkMarkerRanges(view.state), true),
		domEventHandlers: {
			mousedown(view: EditorView, block: BlockInfo, event: Event) {
				if (!(event instanceof MouseEvent) || event.button !== 0) return false;
				view.state.field(bookmarkField).toggle(view.state.doc.lineAt(block.from).number);
				event.preventDefault();
				return true;
			},
		},
	}),
];
