import { type Extension, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { type BlockInfo, type EditorView, GutterMarker, gutter } from "@codemirror/view";

/** What the breakpoint gutter paints, and the click channel back to the caller. */
export type BreakpointMarkers = {
	/** 1-based lines carrying a set breakpoint, ascending and unique. */
	lines: readonly number[];
	/** Subset of `lines` the adapter has not confirmed. */
	unverified: ReadonlySet<number>;
	/** Called with a 1-based line when the gutter column is clicked. */
	toggle: (line: number) => void;
};

const EMPTY: BreakpointMarkers = {
	lines: [],
	unverified: new Set(),
	toggle: () => undefined,
};

/** Replaces the whole marker set in one transaction; never touches the document. */
export const setBreakpoints = StateEffect.define<BreakpointMarkers>();

/** Markers live in editor state so a prop change is one dispatch, never a rebuilt view. */
export const breakpointField = StateField.define<BreakpointMarkers>({
	create: () => EMPTY,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setBreakpoints)) next = effect.value;
		}
		return next;
	},
});

/** One dot: filled when verified, hollow while the adapter has not confirmed the line. */
class BreakpointDot extends GutterMarker {
	readonly unverified: boolean;
	readonly line: number;

	constructor(unverified: boolean, line: number) {
		super();
		this.unverified = unverified;
		this.line = line;
	}

	eq(other: GutterMarker): boolean {
		return (
			other instanceof BreakpointDot &&
			other.unverified === this.unverified &&
			other.line === this.line
		);
	}

	toDOM(): Node {
		const dot = document.createElement("span");
		dot.className = this.unverified ? "cm-breakpoint-dot unverified" : "cm-breakpoint-dot";
		dot.title = this.unverified ? "Unverified breakpoint" : "Breakpoint";
		return dot;
	}
}

/** Line rows shift with the document, so markers are rebuilt from the live doc each call. */
function markersFor(view: EditorView): RangeSet<GutterMarker> {
	const { lines, unverified } = view.state.field(breakpointField);
	const doc = view.state.doc;
	const ranges: { from: number; to: number; value: GutterMarker }[] = [];
	for (const line of lines) {
		if (line < 1 || line > doc.lines) continue;
		const from = doc.line(line).from;
		ranges.push({ from, to: from, value: new BreakpointDot(unverified.has(line), line) });
	}
	return RangeSet.of(ranges, true);
}

/**
 * The breakpoint column. Registered once per view; the caller pushes markers in through
 * `setBreakpoints`. Only this column toggles — the line-number gutter keeps its selection drag.
 */
export const breakpointGutter: Extension = [
	breakpointField,
	gutter({
		class: "cm-breakpoint-gutter",
		markers: (view) => markersFor(view),
		domEventHandlers: {
			mousedown(view: EditorView, block: BlockInfo, event: Event): boolean {
				if (!(event instanceof MouseEvent) || event.button !== 0) return false;
				view.state.field(breakpointField).toggle(view.state.doc.lineAt(block.from).number);
				event.preventDefault();
				return true;
			},
		},
	}),
];

/** Ascending, unique, positive 1-based lines. */
export function normalizeLines(lines: readonly number[] | undefined): number[] {
	if (lines === undefined || lines.length === 0) return [];
	const seen = new Set<number>();
	for (const line of lines) {
		if (Number.isInteger(line) && line >= 1) seen.add(line);
	}
	return [...seen].sort((left, right) => left - right);
}
