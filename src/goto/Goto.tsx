import { useEffect, useMemo, useRef, useState } from "react";
import { lspSymbols, lspWorkspaceSymbols, type WorkspaceSymbol } from "@/project/api";
import "@/goto/goto.css";

export type GotoMode = "class" | "symbol" | "recent";

export type GotoProps = {
	mode: GotoMode;
	root: string;
	/** Active file, needed by the document-symbol mode. */
	path: string | null;
	/** Recent files for the recent mode, newest first. */
	recent: string[];
	onOpen: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

type Row = {
	key: string;
	label: string;
	detail: string;
	path: string;
	line: number;
	character: number;
};

const TITLES: Record<GotoMode, string> = {
	class: "Go to class",
	symbol: "Go to symbol in file",
	recent: "Recent files",
};

function fileNameOf(path: string): string {
	const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return cut === -1 ? path : path.slice(cut + 1);
}

/** Files whose name or directory contains every whitespace-separated term of the query. */
export function filterRows(rows: Row[], query: string): Row[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return rows;
	return rows.filter((row) => {
		const haystack = `${row.label} ${row.detail}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

/**
 * One palette for the three "go to" gestures.
 *
 * Class and symbol modes ask the language server; recent mode takes the caller's history, so it
 * still works before the server has answered anything.
 */
export default function Goto({ mode, root, path, recent, onOpen, onClose }: GotoProps) {
	const [query, setQuery] = useState("");
	const [rows, setRows] = useState<Row[]>([]);
	const [active, setActive] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			if (mode === "recent") {
				setRows(
					recent.map((file) => ({
						key: file,
						label: fileNameOf(file),
						detail: file,
						path: file,
						line: 0,
						character: 0,
					})),
				);
				return;
			}
			setLoading(true);
			try {
				if (mode === "symbol") {
					const symbols =
						path === null ? [] : await lspSymbols(root, path).catch(() => []);
					if (cancelled) return;
					setRows(
						symbols.map((symbol) => ({
							key: `${path ?? ""}:${symbol.range.start.line}:${symbol.name}`,
							label: symbol.name,
							detail: `${"  ".repeat(symbol.depth)}${path === null ? "" : fileNameOf(path)}:${symbol.range.start.line + 1}`,
							path: path ?? "",
							line: symbol.range.start.line,
							character: symbol.range.start.character,
						})),
					);
				} else {
					const symbols: WorkspaceSymbol[] = await lspWorkspaceSymbols(root, query).catch(
						() => [],
					);
					if (cancelled) return;
					setRows(
						symbols.map((symbol) => ({
							key: `${symbol.path}:${symbol.line}:${symbol.name}`,
							label: symbol.name,
							detail: `${symbol.container === "" ? "" : `${symbol.container} · `}${fileNameOf(symbol.path)}:${symbol.line + 1}`,
							path: symbol.path,
							line: symbol.line,
							character: symbol.character,
						})),
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
		// The class mode is the only one that re-queries as the query changes.
	}, [mode, path, recent, root, query]);

	const visible = useMemo(() => filterRows(rows, query).slice(0, 200), [query, rows]);

	useEffect(() => {
		const item = listRef.current?.children[active] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);

	return (
		<div
			className="goto-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="goto-panel" role="dialog" aria-modal="true" aria-label={TITLES[mode]}>
				<header className="goto-head">
					<span className="label">{TITLES[mode]}</span>
					{loading ? <span className="goto-loading">searching…</span> : null}
					<button type="button" className="goto-close" onClick={onClose}>
						esc
					</button>
				</header>
				<input
					ref={inputRef}
					className="goto-input"
					type="text"
					value={query}
					placeholder={mode === "recent" ? "Filter recent files" : "Name"}
					spellCheck={false}
					onChange={(event) => {
						setQuery(event.target.value);
						setActive(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							onClose();
							return;
						}
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActive((current) => Math.min(current + 1, visible.length - 1));
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setActive((current) => Math.max(current - 1, 0));
							return;
						}
						if (event.key === "Enter") {
							event.preventDefault();
							const row = visible[active];
							if (row !== undefined) {
								onOpen(row.path, row.line, row.character);
								onClose();
							}
						}
					}}
				/>
				<ul className="goto-list" ref={listRef}>
					{visible.length === 0 ? (
						<li className="goto-empty">{loading ? "Searching…" : "Nothing matches"}</li>
					) : (
						visible.map((row, index) => (
							<li key={row.key}>
								<button
									type="button"
									className={index === active ? "goto-row active" : "goto-row"}
									onMouseEnter={() => setActive(index)}
									onClick={() => {
										onOpen(row.path, row.line, row.character);
										onClose();
									}}
								>
									<span className="goto-label">{row.label}</span>
									<span className="goto-detail">{row.detail}</span>
								</button>
							</li>
						))
					)}
				</ul>
			</div>
		</div>
	);
}
