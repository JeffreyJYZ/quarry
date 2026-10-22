import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export type OccurrenceItem = { from: number; to: number; strong: boolean };

export const setOccurrences = StateEffect.define<OccurrenceItem[] | null>();

export const occurrencesField = StateField.define<ReturnType<typeof Decoration.set>>({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		let next = value;
		let hadEffect = false;
		for (const effect of tr.effects) {
			if (effect.is(setOccurrences)) {
				hadEffect = true;
				const items = effect.value;
				if (items === null) {
					next = Decoration.none;
					continue;
				}
				const ranges = items
					.map((item) => {
						const className = item.strong
							? "cm-occurrence cm-occurrence-strong"
							: "cm-occurrence";
						return Decoration.mark({ class: className }).range(item.from, item.to);
					})
					.filter((range) => range.from < range.to);
				next = Decoration.set(ranges, true);
			}
		}
		if (tr.docChanged && !hadEffect) {
			next = Decoration.none;
		} else if (tr.docChanged && next !== Decoration.none) {
			next = next.map(tr.changes);
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});
