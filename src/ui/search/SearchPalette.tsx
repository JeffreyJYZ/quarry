import { resultSummary, searchFlags } from "@/lib/search/model";
import "@/ui/search/search.css";
import { SearchHead } from "./SearchHead";
import { SearchReplace } from "./SearchReplace";
import { SearchResults } from "./SearchResults";
import { useReplace } from "./useReplace";
import { useSearchQuery } from "./useSearchQuery";
import { useSearchToggles } from "./useSearchToggles";

export type SearchPaletteProps = {
	root: string;
	/** Opens one absolute path through the app's existing open-by-path flow. */
	onOpen: (path: string) => void;
	onClose: () => void;
	/** Prefill the input on mount (used by Cmd+Shift+F). */
	initialQuery?: string;
};

export default function SearchPalette({ root, onOpen, onClose, initialQuery }: SearchPaletteProps) {
	const toggles = useSearchToggles();
	const search = useSearchQuery({
		root,
		initialQuery,
		onOpen,
		onClose,
		options: toggles.options,
		wholeWord: toggles.wholeWord,
	});
	const replace = useReplace({
		root,
		trimmed: search.trimmed,
		report: search.report,
		options: toggles.options,
		setBusy: search.setBusy,
		setError: search.setError,
	});

	let state: string;
	let stateClass = "search-state";
	if (search.error !== null) {
		state = search.error;
		stateClass = "search-state error";
	} else if (search.busy) {
		state = "searching…";
	} else if (search.trimmed === "") {
		state = "Type a pattern, then Enter. Regex is passed through.";
	} else if (search.invalid) {
		state = "invalid regular expression";
		stateClass = "search-state error";
	} else if (search.report === null) {
		state = "Press Enter to search this project.";
	} else if (search.report.matches.length === 0) {
		state = "No matches.";
	} else {
		state = resultSummary(search.report, search.rows.length, search.fileCount);
	}

	const flags = searchFlags(toggles.options);
	const title = `case-sensitive: ${toggles.caseSensitive ? "on" : "off"}; regex: ${
		toggles.regex ? "on" : "off"
	}; whole word: ${toggles.wholeWord ? "on" : "off"}; sends caseSensitive=${flags.caseSensitive}, fixedStrings=${flags.fixedStrings}${
		toggles.wholeWord ? " (whole word wraps query and forces fixedStrings false)" : ""
	}`;

	return (
		<div className="search-palette" role="dialog" aria-label="Project search">
			<SearchHead
				query={search.query}
				onQueryChange={search.setQuery}
				inputRef={search.inputRef}
				title={title}
				toggles={toggles}
				showReplace={replace.showReplace}
				onToggleReplace={() => replace.setShowReplace((v) => !v)}
				onMove={search.move}
				onSubmit={search.submit}
			/>
			<SearchReplace
				showReplace={replace.showReplace}
				replacement={replace.replacement}
				onReplacementChange={replace.setReplacement}
				onPreview={replace.doPreview}
				onReplaceAll={() => void replace.doReplaceAll()}
				preview={replace.preview}
				trimmed={search.trimmed}
				summary={replace.replaceSummary}
			/>

			<p className={stateClass} role="status">
				{state}
			</p>

			{search.rows.length > 0 ? (
				<SearchResults
					groups={search.groups}
					active={search.active}
					onActive={search.setActive}
					onOpen={onOpen}
					listRef={search.listRef}
				/>
			) : null}

			<div className="search-foot">
				<span>↑↓ move</span>
				<span>enter run or open</span>
				<span>esc close</span>
			</div>
		</div>
	);
}
