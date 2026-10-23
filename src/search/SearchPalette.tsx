import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replaceProject, type SearchReport, searchProject } from "@/project/api";
import "./search.css";
import { describeError } from "@/project/errors";
import {
	buildPreview,
	clipLine,
	groupMatches,
	isPreviewStale,
	PREVIEW_LIMIT,
	type PreviewLine,
	type PreviewSnapshot,
	resultSummary,
	type SearchOptions,
	searchFlags,
	transformQuery,
} from "@/search/model";

export type SearchPaletteProps = {
	root: string;
	/** Opens one absolute path through the app's existing open-by-path flow. */
	onOpen: (path: string) => void;
	onClose: () => void;
	/** Prefill the input on mount (used by Cmd+Shift+F). */
	initialQuery?: string;
};

// Session-wide toggle + last-query state so the palette remembers across open/close.
let sessionCaseSensitive = false;
let sessionRegex = true;
let sessionWholeWord = false;
let sessionLastQuery = "";

export default function SearchPalette({ root, onOpen, onClose, initialQuery }: SearchPaletteProps) {
	const [query, setQuery] = useState(initialQuery ?? sessionLastQuery);
	const [report, setReport] = useState<SearchReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const [ranQuery, setRanQuery] = useState<string | null>(null);
	const [caseSensitive, setCaseSensitive] = useState(sessionCaseSensitive);
	const [regex, setRegex] = useState(sessionRegex);
	const [wholeWord, setWholeWord] = useState(sessionWholeWord);
	const [showReplace, setShowReplace] = useState(false);
	const [replacement, setReplacement] = useState("");
	const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
	const [replaceSummary, setReplaceSummary] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	/** Bumped per search so a slow earlier reply never overwrites a newer one. */
	const sequence = useRef(0);

	const options = useMemo<SearchOptions>(
		() => ({ caseSensitive, regex, wholeWord }),
		[caseSensitive, regex, wholeWord],
	);
	const fileCount = useMemo(
		() => (report === null ? 0 : new Set(report.matches.map((m) => m.path)).size),
		[report],
	);
	const groups = useMemo(() => (report === null ? [] : groupMatches(report.matches)), [report]);
	const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

	const invalid = useMemo(() => {
		if (!wholeWord) {
			return false;
		}
		const trimmed = query.trim();
		if (trimmed === "") {
			return false;
		}
		try {
			new RegExp(transformQuery(trimmed, options));
			return false;
		} catch {
			return true;
		}
	}, [query, options, wholeWord]);

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
			const transformed = transformQuery(next, options);
			if (wholeWord) {
				try {
					new RegExp(transformed);
				} catch {
					setReport(null);
					setRanQuery(next);
					setActive(0);
					setError("invalid regular expression");
					setBusy(false);
					return;
				}
			}
			setBusy(true);
			setError(null);
			try {
				const flags = searchFlags(options);
				const result = await searchProject(
					root,
					transformed,
					undefined,
					flags.caseSensitive,
					flags.fixedStrings,
				);
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
		[root, options, wholeWord],
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

	const trimmed = query.trim();

	const doPreview = () => {
		if (report === null || trimmed === "") {
			return;
		}
		const built = buildPreview(
			report.matches.map((m) => ({ path: m.path, line: m.line, text: m.text })),
			trimmed,
			replacement,
			options,
		);
		setPreview({ query: trimmed, replacement, lines: built.lines, truncated: built.truncated });
		setReplaceSummary(null);
	};

	const doReplaceAll = async () => {
		if (isPreviewStale(preview, trimmed, replacement)) {
			setError("preview is stale: run preview again before replacing");
			return;
		}
		const flags = searchFlags(options);
		setBusy(true);
		setError(null);
		try {
			const res = await replaceProject(
				root,
				transformQuery(trimmed, options),
				replacement,
				flags.caseSensitive,
				flags.fixedStrings,
			);
			const errPart = res.errors.length > 0 ? `; ${res.errors.length} errors` : "";
			setReplaceSummary(
				`${res.files_changed} files changed, ${res.replacements} replacements made${errPart}`,
			);
			if (res.errors.length > 0) {
				setError(res.errors.join("; "));
			}
		} catch (failure) {
			setError(describeError(failure));
		} finally {
			setBusy(false);
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
	} else if (invalid) {
		state = "invalid regular expression";
		stateClass = "search-state error";
	} else if (report === null) {
		state = "Press Enter to search this project.";
	} else if (report.matches.length === 0) {
		state = "No matches.";
	} else {
		state = resultSummary(report, rows.length, fileCount);
	}

	// Persist session state.
	useEffect(() => {
		sessionCaseSensitive = caseSensitive;
		sessionRegex = regex;
		sessionWholeWord = wholeWord;
	}, [caseSensitive, regex, wholeWord]);

	useEffect(() => {
		sessionLastQuery = query;
	}, [query]);

	const flags = searchFlags(options);
	const title = `case-sensitive: ${caseSensitive ? "on" : "off"}; regex: ${
		regex ? "on" : "off"
	}; whole word: ${wholeWord ? "on" : "off"}; sends caseSensitive=${flags.caseSensitive}, fixedStrings=${flags.fixedStrings}${
		wholeWord ? " (whole word wraps query and forces fixedStrings false)" : ""
	}`;

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
					title={title}
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
					onClick={() => setShowReplace((v) => !v)}
				>
					↔
				</button>
				<span className="search-hint">enter</span>
			</div>
			{showReplace ? (
				<div className="search-replace-row">
					<input
						className="search-input"
						value={replacement}
						placeholder="replacement"
						aria-label="Replacement"
						spellCheck={false}
						autoComplete="off"
						onChange={(event) => setReplacement(event.target.value)}
					/>
					<button type="button" className="search-toggle" onClick={doPreview}>
						preview
					</button>
					<button
						type="button"
						className="search-toggle"
						onClick={() => void doReplaceAll()}
					>
						replace all
					</button>
				</div>
			) : null}
			{preview !== null ? (
				<div className="search-preview">
					{preview.lines.map((p: PreviewLine) => (
						<div
							className="search-preview-line"
							key={`${p.path}:${p.line}:${p.oldText}`}
						>
							<span className="search-pos">
								{p.path}:{p.line}
							</span>
							<span className="search-text">{clipLine(p.oldText)}</span>
							<span className="search-text">→ {clipLine(p.newText)}</span>
						</div>
					))}
					{preview.truncated ? (
						<p className="search-state">preview truncated (cap {PREVIEW_LIMIT})</p>
					) : null}
					{isPreviewStale(preview, trimmed, replacement) ? (
						<p className="search-state error">preview is stale</p>
					) : null}
				</div>
			) : null}
			{replaceSummary !== null ? <p className="search-state">{replaceSummary}</p> : null}

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
