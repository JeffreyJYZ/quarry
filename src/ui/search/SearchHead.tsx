import type { RefObject } from "react";
import type { SearchToggles } from "./useSearchToggles";

export function SearchHead({
	query,
	onQueryChange,
	inputRef,
	title,
	toggles,
	showReplace,
	onToggleReplace,
	onMove,
	onSubmit,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	title: string;
	toggles: SearchToggles;
	showReplace: boolean;
	onToggleReplace: () => void;
	onMove: (step: number) => void;
	onSubmit: () => void;
}) {
	const { caseSensitive, setCaseSensitive, regex, setRegex, wholeWord, setWholeWord } = toggles;
	return (
		<div className="search-head">
			<span className="label">search</span>
			<input
				ref={inputRef}
				className="search-input"
				value={query}
				placeholder="regex pattern"
				aria-label="Search query"
				title={title}
				spellCheck={false}
				autoComplete="off"
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						onMove(1);
						return;
					}
					if (event.key === "ArrowUp") {
						event.preventDefault();
						onMove(-1);
						return;
					}
					if (event.key === "Enter") {
						event.preventDefault();
						onSubmit();
					}
				}}
			/>
			<button
				type="button"
				className={caseSensitive ? "search-toggle active" : "search-toggle"}
				title={title}
				onClick={() => setCaseSensitive((v) => !v)}
			>
				Aa
			</button>
			<button
				type="button"
				className={regex ? "search-toggle active" : "search-toggle"}
				title={title}
				onClick={() => setRegex((v) => !v)}
			>
				.*
			</button>
			<button
				type="button"
				className={wholeWord ? "search-toggle active" : "search-toggle"}
				title={title}
				onClick={() => setWholeWord((v) => !v)}
			>
				W
			</button>
			<button
				type="button"
				className={showReplace ? "search-toggle active" : "search-toggle"}
				title="toggle replace field"
				onClick={onToggleReplace}
			>
				↔
			</button>
			<span className="search-hint">enter</span>
		</div>
	);
}
