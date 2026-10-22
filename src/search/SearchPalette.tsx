import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SearchReport, searchProject } from "@/project/api";
import { describeError } from "@/project/errors";
import { clipLine, groupMatches, resultSummary } from "@/search/model";

export type SearchPaletteProps = {
	root: string;
	/** Opens one absolute path through the app's existing open-by-path flow. */
	onOpen: (path: string) => void;
	onClose: () => void;
};

/**
 * Floating project-search palette. It owns the query, the result set and the keyboard highlight; the
 * app owns the tabs, so a chosen row is handed back as a path and never read here.
 */
export default function SearchPalette({ root, onOpen, onClose }: SearchPaletteProps) {
	const [query, setQuery] = useState("");
	const [report, setReport] = useState<SearchReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const [ranQuery, setRanQuery] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	/** Bumped per search so a slow earlier reply never overwrites a newer one. */
	const sequence = useRef(0);

	const trimmed = query.trim();
	const groups = useMemo(() => (report === null ? [] : groupMatches(report.matches)), [report]);
	const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

	const run = useCallback(
		async (value: string) => {
			const next = value.trim();
			sequence.current += 1;
			const ticket = sequence.current;
			if (next === "") {
				setReport(null);
				setError(null);
				setBusy(false);
				setRanQuery("");
				setActive(0);
				return;
			}
			setBusy(true);
			setError(null);
			try {
				const result = await searchProject(root, next);
				if (ticket !== sequence.current) {
					return;
				}
				setReport(result);
				setRanQuery(next);
				setActive(0);
			} catch (failure) {
				if (ticket !== sequence.current) {
					return;
				}
				setReport(null);
				setRanQuery(next);
				setActive(0);
				setError(describeError(failure));
			} finally {
				if (ticket === sequence.current) {
					setBusy(false);
				}
			}
		},
		[root],
	);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Escape closes from anywhere, including a focused result row; the palette is modal in practice.
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	useEffect(() => {
		const host = listRef.current;
		if (host === null) {
			return;
		}
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const move = (step: number) => {
		if (rows.length === 0) {
			return;
		}
		setActive((current) => (current + step + rows.length) % rows.length);
	};

	/** First Enter runs the query; once the shown results belong to this text, Enter opens the row. */
	const submit = () => {
		if (trimmed === "" || report === null || ranQuery !== trimmed) {
			void run(trimmed);
			return;
		}
		const row = rows[active];
		if (row !== undefined) {
			onOpen(row.match.path);
		}
	};

	let state: string;
	let stateClass = "search-state";
	if (error !== null) {
		state = error;
		stateClass = "search-state error";
	} else if (busy) {
		state = "searching…";
	} else if (trimmed === "") {
		state = "Type a pattern, then Enter. Regex is passed through.";
	} else if (report === null) {
		state = "Press Enter to search this project.";
	} else if (report.matches.length === 0) {
		state = "No matches.";
	} else {
		state = resultSummary(report, rows.length);
	}

	return (
		<div className="search-palette" role="dialog" aria-label="Project search">
			<div className="search-head">
				<span className="label">search</span>
				<input
					ref={inputRef}
					className="search-input"
					value={query}
					placeholder="regex pattern"
					aria-label="Search query"
					spellCheck={false}
					autoComplete="off"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							move(1);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							move(-1);
							return;
						}
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
						}
					}}
				/>
				<span className="search-hint">enter</span>
			</div>

			<p className={stateClass} role="status">
				{state}
			</p>

			{rows.length > 0 ? (
				<div className="search-results" ref={listRef}>
					{groups.map((group) => (
						<div className="search-group" key={group.path}>
							<div className="search-file" title={group.path}>
								<span className="search-file-name">{group.name}</span>
								<span className="search-file-dir">{group.dir}</span>
								<span className="search-file-count">{group.rows.length}</span>
							</div>
							{group.rows.map((row) => (
								<button
									type="button"
									key={`${row.match.path}:${row.match.line}:${row.match.column}:${row.index}`}
									className={
										row.index === active ? "search-row active" : "search-row"
									}
									data-index={row.index}
									title={`${row.match.path}:${row.match.line}:${row.match.column}`}
									onClick={() => onOpen(row.match.path)}
									onMouseEnter={() => setActive(row.index)}
								>
									<span className="search-pos">
										{row.match.line}:{row.match.column}
									</span>
									<span className="search-text">{clipLine(row.match.text)}</span>
								</button>
							))}
						</div>
					))}
				</div>
			) : null}

			<div className="search-foot">
				<span>↑↓ move</span>
				<span>enter run or open</span>
				<span>esc close</span>
			</div>
		</div>
	);
}
