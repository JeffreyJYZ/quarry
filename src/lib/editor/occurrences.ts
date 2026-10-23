import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export type OccurrenceItem = { from: number; to: number; strong: boolean };

export const setOccurrences = StateEffect.define<OccurrenceItem[] | null>();

/** Return the start offsets of every non-overlapping occurrence of `word` in `text`. */
export function occurrenceStarts(text: string, word: string): number[] {
	const result: number[] = [];
	if (word === "") return result;
	let index = 0;
	while (true) {
		const found = text.indexOf(word, index);
		if (found === -1) break;
		result.push(found);
		index = found + word.length;
	}
	return result;
}

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
