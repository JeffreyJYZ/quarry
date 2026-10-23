import type { Range } from "@codemirror/state";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

export type BlameEntry = { line: number; label: string };

export function blameLabel(hash: string, author: string): string {
	return `${hash} · ${author}`;
}

export function blameTitle(hash: string, author: string, subject: string): string {
	return `${hash} · ${author} · ${subject}`;
}

class BlameWidget extends WidgetType {
	constructor(
		private readonly text: string,
		private readonly title: string,
	) {
		super();
	}
	eq(other: BlameWidget): boolean {
		return other.text === this.text && other.title === this.title;
	}
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "cm-blame";
		span.textContent = this.text;
		span.title = this.title;
		span.style.pointerEvents = "none";
		span.style.userSelect = "none";
		return span;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

export const setBlame = StateEffect.define<BlameEntry[] | null>();

export const blameField = StateField.define<ReturnType<typeof Decoration.set>>({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setBlame)) {
				const entries = effect.value;
				if (entries === null) return Decoration.none;
				const ranges: Range<Decoration>[] = [];
				for (const entry of entries) {
					const lineNo = Math.min(Math.max(entry.line, 1), tr.state.doc.lines);
					const line = tr.state.doc.line(lineNo);
					ranges.push(
						Decoration.widget({
							widget: new BlameWidget(entry.label, entry.label),
							side: 1,
						}).range(line.to),
					);
				}
				ranges.sort((a, b) => a.from - b.from);
				return Decoration.set(ranges, true);
			}
		}
		if (tr.docChanged) {
			return value.map(tr.changes);
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field),
});
