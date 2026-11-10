import { type Extension, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { type BlockInfo, type EditorView, GutterMarker, gutter } from "@codemirror/view";
import type { MarkerState, TestMarker } from "@/lib/tests/gutter";

const EMPTY: readonly TestMarker[] = [];

/** Replaces the whole marker set in one transaction; never touches the document. */
export const setTestMarkers = StateEffect.define<readonly TestMarker[]>();

/** Markers live in editor state so a dock result is one dispatch, never a rebuilt view. */
export const testMarkersField = StateField.define<readonly TestMarker[]>({
	create: () => EMPTY,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setTestMarkers)) next = effect.value;
		}
		return next;
	},
});

const GLYPH: Record<MarkerState, string> = {
	idle: "▶",
	running: "◦",
	passed: "✓",
	failed: "✗",
};

/** One run button: left click runs the test or group, right click runs the group behind it. */
class TestMarkerDot extends GutterMarker {
	readonly marker: TestMarker;

	constructor(marker: TestMarker) {
		super();
		this.marker = marker;
	}

	eq(other: GutterMarker): boolean {
		return other instanceof TestMarkerDot && sameMarker(other.marker, this.marker);
	}

	toDOM(): Node {
		const dot = document.createElement("span");
		const { kind, state } = this.marker;
		dot.className = `cm-test-marker ${kind} ${state}`;
		dot.textContent = GLYPH[state];
		dot.title = title(this.marker);
		dot.setAttribute("role", "img");
		dot.setAttribute("aria-label", title(this.marker));
		return dot;
	}
}

function title(marker: TestMarker): string {
	if (marker.state === "running") return `running ${marker.name}`;
	if (marker.kind === "test") return `Run ${marker.name}`;
	const count = marker.group.length;
	return `Run ${count} test${count === 1 ? "" : "s"} in ${marker.name}`;
}

function sameMarker(left: TestMarker, right: TestMarker): boolean {
	return (
		left.line === right.line &&
		left.kind === right.kind &&
		left.name === right.name &&
		left.state === right.state &&
		left.group.join("\n") === right.group.join("\n")
	);
}

function markersFor(view: EditorView): RangeSet<GutterMarker> {
	const doc = view.state.doc;
	const ranges: { from: number; to: number; value: GutterMarker }[] = [];
	for (const marker of view.state.field(testMarkersField)) {
		if (marker.line < 1 || marker.line > doc.lines) continue;
		const from = doc.line(marker.line).from;
		ranges.push({ from, to: from, value: new TestMarkerDot(marker) });
	}
	return RangeSet.of(ranges, true);
}

function markerAt(view: EditorView, pos: number): TestMarker | null {
	const line = view.state.doc.lineAt(pos).number;
	return view.state.field(testMarkersField).find((marker) => marker.line === line) ?? null;
}

/**
 * The test column: a run button on each known test line and on each module holding tests.
 *
 * The column is mounted by its own compartment, so a file with no tests has no empty gutter beside
 * the line numbers. `onMarker` receives the marker and whether the group behind it was asked for.
 */
export function testGutter(onMarker: (marker: TestMarker, group: boolean) => void): Extension {
	return [
		testMarkersField,
		gutter({
			class: "cm-test-gutter",
			markers: (view) => markersFor(view),
			domEventHandlers: {
				mousedown(view: EditorView, block: BlockInfo, event: Event): boolean {
					if (!(event instanceof MouseEvent) || event.button !== 0) return false;
					const marker = markerAt(view, block.from);
					if (marker === null) return false;
					event.preventDefault();
					onMarker(marker, marker.kind === "group");
					return true;
				},
				contextmenu(view: EditorView, block: BlockInfo, event: Event): boolean {
					const marker = markerAt(view, block.from);
					if (marker === null) return false;
					event.preventDefault();
					onMarker(marker, true);
					return true;
				},
			},
		}),
	];
}
