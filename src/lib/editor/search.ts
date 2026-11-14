import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { searchRegex } from "@/lib/search/replace";

export type SearchMatch = { from: number; to: number };

export type SearchState = { matches: SearchMatch[]; active: number };

export const emptySearchState: SearchState = { matches: [], active: -1 };

export const setSearchMatches = StateEffect.define<SearchState>();

/** Every match of the query in `text`, or `null` when the pattern is invalid. */
export function collectMatches(
	text: string,
	query: string,
	options: { caseSensitive: boolean; regex: boolean },
): SearchMatch[] | null {
	if (query === "") return [];
	const re = searchRegex(query, { ...options, wholeWord: false });
	if (re === null) return null;
	const found: SearchMatch[] = [];
	let match = re.exec(text);
	while (match !== null) {
		if (match[0].length === 0) {
			re.lastIndex += 1;
			match = re.exec(text);
			continue;
		}
		found.push({ from: match.index, to: match.index + match[0].length });
		if (found.length > 10000) break;
		match = re.exec(text);
	}
	return found;
}

/** A match this document can hold: anything past its end belongs to a longer one. */
function inside(match: SearchMatch, length: number): boolean {
	return match.from >= 0 && match.to > match.from && match.to <= length;
}

export const searchField = StateField.define<SearchState>({
	create: () => emptySearchState,
	update(value, transaction) {
		let next = value;
		let published = false;
		for (const effect of transaction.effects) {
			if (effect.is(setSearchMatches)) {
				next = effect.value;
				published = true;
			}
		}
		// A published list was measured on the document the publisher can see, so it is checked
		// against this transaction's own document. A stored list is mapped through the change, and
		// only positions the *old* document could hold are worth mapping: `mapPos` throws on
		// anything past the changeset, which is what a list one frame out of date looks like.
		const length = published ? transaction.state.doc.length : transaction.startState.doc.length;
		const valid = next.matches.filter((match) => inside(match, length));
		if (published) {
			const active = valid.length === 0 ? -1 : Math.min(next.active, valid.length - 1);
			return { matches: valid, active };
		}
		if (!transaction.docChanged || value.matches.length === 0) return value;
		const mapped = valid
			.map((match) => ({
				from: transaction.changes.mapPos(match.from),
				to: transaction.changes.mapPos(match.to),
			}))
			.filter((match) => match.to > match.from);
		return { ...value, matches: mapped };
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
