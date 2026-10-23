import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SearchOptions } from "@/lib/search/model";
import { searchSession } from "./parts";

export type SearchToggles = {
	caseSensitive: boolean;
	setCaseSensitive: Dispatch<SetStateAction<boolean>>;
	regex: boolean;
	setRegex: Dispatch<SetStateAction<boolean>>;
	wholeWord: boolean;
	setWholeWord: Dispatch<SetStateAction<boolean>>;
	options: SearchOptions;
};

export function useSearchToggles(): SearchToggles {
	const [caseSensitive, setCaseSensitive] = useState(searchSession.caseSensitive);
	const [regex, setRegex] = useState(searchSession.regex);
	const [wholeWord, setWholeWord] = useState(searchSession.wholeWord);

	const options = useMemo<SearchOptions>(
		() => ({ caseSensitive, regex, wholeWord }),
		[caseSensitive, regex, wholeWord],
	);

	// Persist session state.
	useEffect(() => {
		searchSession.caseSensitive = caseSensitive;
		searchSession.regex = regex;
		searchSession.wholeWord = wholeWord;
	}, [caseSensitive, regex, wholeWord]);

	return {
		caseSensitive,
		setCaseSensitive,
		regex,
		setRegex,
		wholeWord,
		setWholeWord,
		options,
	};
}
