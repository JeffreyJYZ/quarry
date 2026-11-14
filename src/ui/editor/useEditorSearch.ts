import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
	collectMatches,
	emptySearchState,
	setSearchMatches,
	type SearchMatch,
} from "@/lib/editor/search";
import { replacementChanges } from "@/lib/search/replace";

/** In-file search and replace: matches are pushed into the search field as a decoration set. */
export function useEditorSearch(viewRef: { current: EditorView | null }) {
	const [searchOpen, setSearchOpen] = useState(false);
	const [replaceMode, setReplaceMode] = useState(false);
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [useRegex, setUseRegex] = useState(false);
	const [matches, setMatches] = useState<SearchMatch[]>([]);
	const [active, setActive] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const searchOpenRef = useRef(searchOpen);
	searchOpenRef.current = searchOpen;
	const queryRef = useRef(query);
	queryRef.current = query;
	const caseRef = useRef(caseSensitive);
	caseRef.current = caseSensitive;
	const regexRef = useRef(useRegex);
	regexRef.current = useRegex;
	const replacementRef = useRef(replacement);
	replacementRef.current = replacement;
	const matchesRef = useRef(matches);
	matchesRef.current = matches;
	const activeRef = useRef(active);
	activeRef.current = active;

	/** Matches measured on `text` now: a list from before an edit describes another document. */
	const findMatches = (text: string) =>
		collectMatches(text, queryRef.current, {
			caseSensitive: caseRef.current,
			regex: regexRef.current,
		});

	const recompute = () => {
		const view = viewRef.current;
		if (view === null) return;
		if (!searchOpenRef.current || queryRef.current === "") {
			setMatches([]);
			setActive(0);
			setError(null);
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		const found = findMatches(view.state.doc.toString());
		if (found === null) {
			setMatches([]);
			setActive(0);
			setError(`invalid regular expression: ${queryRef.current}`);
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		setError(null);
		setMatches(found);
		const nextActive = found.length > 0 ? 0 : -1;
		setActive(Math.max(nextActive, 0));
		view.dispatch({ effects: setSearchMatches.of({ matches: found, active: nextActive }) });
		if (found.length > 0) {
			const first = found[0];
			view.dispatch({ selection: { anchor: first.from, head: first.to } });
		}
	};

	const open = (replace: boolean) => {
		setReplaceMode(replace);
		setSearchOpen(true);
		searchOpenRef.current = true;
	};

	const close = () => {
		setSearchOpen(false);
		searchOpenRef.current = false;
		setMatches([]);
		setActive(0);
		setError(null);
		const view = viewRef.current;
		if (view !== null) {
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			view.focus();
		}
	};

	const step = (delta: number) => {
		const view = viewRef.current;
		if (view === null) return;
		const current = findMatches(view.state.doc.toString()) ?? [];
		if (current.length === 0) {
			// Republish empty rather than select a match that belonged to a longer document.
			recompute();
			return;
		}
		const next = (activeRef.current + delta + current.length) % current.length;
		setActive(next);
		activeRef.current = next;
		setMatches(current);
		view.dispatch({ effects: setSearchMatches.of({ matches: current, active: next }) });
		const m = current[next];
		view.dispatch({ selection: { anchor: m.from, head: m.to } });
	};

	const replaceOne = () => {
		const view = viewRef.current;
		if (view === null) return;
		const current = findMatches(view.state.doc.toString()) ?? [];
		const m = current[activeRef.current];
		if (m === undefined) {
			recompute();
			return;
		}
		view.dispatch({ changes: { from: m.from, to: m.to, insert: replacementRef.current } });
	};

	const replaceAll = () => {
		const view = viewRef.current;
		if (view === null) return;
		const changes = replacementChanges(
			view.state.doc.toString(),
			queryRef.current,
			replacementRef.current,
			{ caseSensitive: caseRef.current, regex: regexRef.current, wholeWord: false },
		);
		if (changes.length === 0) return;
		view.dispatch({ changes });
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: the query, flags and open state drive it
	useEffect(() => {
		if (!searchOpen) return;
		recompute();
	}, [searchOpen, query, caseSensitive, useRegex]);

	const changeQuery = (value: string) => {
		setQuery(value);
		queryRef.current = value;
	};
	const changeReplacement = (value: string) => {
		setReplacement(value);
		replacementRef.current = value;
	};
	const toggleCase = () => {
		setCaseSensitive((current) => {
			caseRef.current = !current;
			return !current;
		});
	};
	const toggleRegex = () => {
		setUseRegex((current) => {
			regexRef.current = !current;
			return !current;
		});
	};

	return {
		changeQuery,
		changeReplacement,
		toggleCase,
		toggleRegex,
		searchOpen,
		searchOpenRef,
		replaceMode,
		query,
		queryRef,
		setQuery,
		replacement,
		replacementRef,
		setReplacement,
		caseSensitive,
		caseRef,
		setCaseSensitive,
		useRegex,
		regexRef,
		setUseRegex,
		matches,
		matchesRef,
		active,
		error,
		open,
		close,
		step,
		replaceOne,
		replaceAll,
		recompute,
	};
}

export type EditorSearch = ReturnType<typeof useEditorSearch>;
