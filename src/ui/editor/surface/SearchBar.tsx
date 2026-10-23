import type { EditorSearch } from "@/ui/editor/useEditorSearch";

/** The in-file find and replace bar, floated over the surface. */
export default function SearchBar({ search }: { search: EditorSearch }) {
	return (
		<div className="cm-search-bar">
			<input
				className="search-input"
				value={search.query}
				onChange={(event) => search.changeQuery(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						search.step(event.shiftKey ? -1 : 1);
					}
					if (event.key === "Escape") {
						event.preventDefault();
						search.close();
					}
				}}
			/>
			<span className="search-count">
				{search.matches.length === 0
					? search.error !== null
						? ""
						: "0 of 0"
					: `${search.active + 1} of ${search.matches.length}`}
			</span>
			{search.error !== null ? <span className="search-error">{search.error}</span> : null}
			<button type="button" onClick={() => search.step(-1)} aria-label="previous">
				Prev
			</button>
			<button type="button" onClick={() => search.step(1)} aria-label="next">
				Next
			</button>
			<button
				type="button"
				className={search.caseSensitive ? "active" : ""}
				onClick={search.toggleCase}
				aria-label="case sensitive"
			>
				Aa
			</button>
			<button
				type="button"
				className={search.useRegex ? "active" : ""}
				onClick={search.toggleRegex}
				aria-label="regex"
			>
				.*
			</button>
			{search.replaceMode ? (
				<>
					<input
						className="replace-input"
						value={search.replacement}
						onChange={(event) => search.changeReplacement(event.target.value)}
					/>
					<button type="button" onClick={search.replaceOne}>
						Replace
					</button>
					<button type="button" onClick={search.replaceAll}>
						Replace all
					</button>
				</>
			) : null}
			<button type="button" onClick={search.close} aria-label="close">
				Close
			</button>
		</div>
	);
}
