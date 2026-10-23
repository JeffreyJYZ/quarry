import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { emptySearchState, setSearchMatches, type SearchMatch } from "@/lib/editor/search";

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

	const recompute = () => {
		const view = viewRef.current;
		if (view === null) return;
		const q = queryRef.current;
		if (!searchOpenRef.current || q === "") {
			setMatches([]);
			setActive(0);
			setError(null);
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		let source = q;
		if (!regexRef.current) source = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		let re: RegExp;
		try {
			re = new RegExp(source, caseRef.current ? "g" : "gi");
		} catch {
			setMatches([]);
			setActive(0);
			setError("invalid regex");
			view.dispatch({ effects: setSearchMatches.of(emptySearchState) });
			return;
		}
		setError(null);
		const text = view.state.doc.toString();
		const found: SearchMatch[] = [];
		re.lastIndex = 0;
		let match: RegExpExecArray | null = re.exec(text);
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
		setMatches(found);
		const nextActive = found.length > 0 ? 0 : -1;
		setActive(Math.max(nextActive, 0));
		view.dispatch({
			effects: setSearchMatches.of({
				matches: found,
				active: nextActive >= 0 ? nextActive : -1,
			}),
		});
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
		const current = matchesRef.current;
		if (current.length === 0) return;
		const next = (activeRef.current + delta + current.length) % current.length;
		setActive(next);
		activeRef.current = next;
		const view = viewRef.current;
		if (view === null) return;
		view.dispatch({ effects: setSearchMatches.of({ matches: current, active: next }) });
		const m = current[next];
		view.dispatch({ selection: { anchor: m.from, head: m.to } });
	};

	const replaceOne = () => {
		const view = viewRef.current;
		const current = matchesRef.current;
		if (view === null || current.length === 0) return;
		const m = current[activeRef.current];
		view.dispatch({ changes: { from: m.from, to: m.to, insert: replacementRef.current } });
	};

	const replaceAll = () => {
		const view = viewRef.current;
		const current = matchesRef.current;
		if (view === null || current.length === 0) return;
		const changes = [...current].reverse().map((m) => ({
			from: m.from,
			to: m.to,
			insert: replacementRef.current,
		}));
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
