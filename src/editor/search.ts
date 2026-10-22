import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export type SearchMatch = { from: number; to: number };

export type SearchState = { matches: SearchMatch[]; active: number };

export const emptySearchState: SearchState = { matches: [], active: -1 };

export const setSearchMatches = StateEffect.define<SearchState>();

export const searchField = StateField.define<SearchState>({
	create: () => emptySearchState,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setSearchMatches)) next = effect.value;
		}
		if (transaction.docChanged && next.matches.length > 0) {
			const mapped = next.matches
				.map((match) => ({
					from: transaction.changes.mapPos(match.from),
					to: transaction.changes.mapPos(match.to),
				}))
				.filter((match) => match.to > match.from);
			next = { ...next, matches: mapped };
		}
		return next;
	},
});

export const searchDecorations = EditorView.decorations.from(searchField, (state) => {
	const ranges = state.matches
		.map((match, index) => {
			const className =
				index === state.active
					? "cm-searchMatch cm-searchMatch-selected"
					: "cm-searchMatch";
			return Decoration.mark({ class: className }).range(match.from, match.to);
		})
		.filter((range) => range.from < range.to);
	return Decoration.set(ranges, true);
});
