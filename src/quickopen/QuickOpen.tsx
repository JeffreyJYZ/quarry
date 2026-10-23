import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listFiles } from "@/project/api";
import { describeError } from "@/project/errors";
import {
	basename,
	matchPositions,
	rankFiles,
	splitQuery as splitQueryRank,
} from "@/quickopen/rank";
import "@/quickopen/quickopen.css";

const STALE_MS = 30_000;
const RECENT_LIMIT = 30;

type CacheEntry = { files: string[]; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const recent: string[] = [];

export function recordRecent(path: string): void {
	const index = recent.indexOf(path);
	if (index !== -1) {
		recent.splice(index, 1);
	}
	recent.unshift(path);
	if (recent.length > 200) {
		recent.length = 200;
	}
}

type Props = {
	root: string;
	openPaths: ReadonlySet<string>;
	onOpen: (path: string) => void;
	onClose: () => void;
};

const splitQuery = splitQueryRank;

function highlight(text: string, indices: number[]): ReactNode {
	const set = new Set(indices);
	const parts: React.ReactNode[] = [];
	let buffer = "";
	for (let i = 0; i < text.length; i++) {
		if (set.has(i)) {
			if (buffer.length > 0) {
				parts.push(<span key={`t-${i}`}>{buffer}</span>);
				buffer = "";
			}
			parts.push(
				<span key={`h-${i}`} className="quick-open-hit">
					{text[i]}
				</span>,
			);
		} else {
			buffer += text[i];
		}
	}
	if (buffer.length > 0) parts.push(<span key="tail">{buffer}</span>);
	return parts.length === 0 ? text : parts;
}

export default function QuickOpen({ root, openPaths, onOpen, onClose }: Props) {
	const [query, setQuery] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const fetchTokenRef = useRef(0);

	const fetchFiles = useCallback(
		async (force: boolean) => {
			const cached = cache.get(root);
			if (!force && cached !== undefined && Date.now() - cached.fetchedAt < STALE_MS) {
				setFiles(cached.files);
				return;
			}
			const token = ++fetchTokenRef.current;
			setBusy(true);
			setError(null);
			try {
				const next = await listFiles(root);
				if (token !== fetchTokenRef.current) return;
				cache.set(root, { files: next, fetchedAt: Date.now() });
				setFiles(next);
			} catch (failure) {
				if (token !== fetchTokenRef.current) return;
				setError(describeError(failure));
			} finally {
				if (token === fetchTokenRef.current) setBusy(false);
			}
		},
		[root],
	);

	useEffect(() => {
		const cached = cache.get(root);
		const stale = cached === undefined || Date.now() - cached.fetchedAt > STALE_MS;
		void fetchFiles(stale);
	}, [root, fetchFiles]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onClose();
		};
		const handleCmdP = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== "p") return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		window.addEventListener("keydown", handleCmdP, true);
		return () => {
			window.removeEventListener("keydown", handleEscape);
			window.removeEventListener("keydown", handleCmdP, true);
		};
	}, [onClose]);

	const { primary, filter } = splitQuery(query);
	const isFilterActive = query.includes(" ") && filter.length > 0;

	const ranked = useMemo(() => {
		const q = primary.trim();
		if (q === "") {
			const recentPaths = recent.filter((path) => files.includes(path));
			return recentPaths.slice(0, RECENT_LIMIT);
		}
		let result = rankFiles(files, q);
		if (filter.trim() !== "") {
			const f = filter.trim().toLowerCase();
			result = result.filter((path) => path.toLowerCase().includes(f));
		}
		return result;
	}, [files, primary, filter]);

	const mainList = useMemo(() => {
		if (primary.trim() !== "") return ranked;
		const recentPaths = new Set(
			recent.filter((path) => files.includes(path)).slice(0, RECENT_LIMIT),
		);
		return files.filter((path) => !recentPaths.has(path));
	}, [files, primary, ranked]);

	const displayList =
		primary.trim() === ""
			? [...recent.filter((p) => files.includes(p)).slice(0, RECENT_LIMIT), ...mainList]
			: ranked;

	// active resets on query change via the input handler above.

	useEffect(() => {
		const host = listRef.current;
		if (host === null) return;
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const move = (step: number) => {
		if (displayList.length === 0) return;
		setActive((current) => (current + step + displayList.length) % displayList.length);
	};

	const submit = () => {
		const path = displayList[active];
		if (path === undefined) return;
		recordRecent(path);
		onOpen(path);
		onClose();
	};

	const jump = (to: "start" | "end") => {
		if (displayList.length === 0) return;
		setActive(to === "start" ? 0 : displayList.length - 1);
	};

	return (
		<div className="search-palette" role="dialog" aria-label="Quick open">
			<div className="search-head">
				<span className="label">open</span>
				<input
					ref={inputRef}
					className="search-input"
					value={query}
					placeholder="file name"
					aria-label="Quick open"
					spellCheck={false}
					autoComplete="off"
					onChange={(event) => {
						setQuery(event.target.value);
						setActive(0);
					}}
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
						if (event.key === "Home") {
							event.preventDefault();
							jump("start");
							return;
						}
						if (event.key === "End") {
							event.preventDefault();
							jump("end");
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
					className="search-toggle"
					title="Refresh files"
					onClick={() => void fetchFiles(true)}
				>
					refresh
				</button>
				<span className="search-hint">enter</span>
			</div>
			{isFilterActive ? (
				<p className="search-state" role="status">
					filter active: {filter.trim()}
				</p>
			) : null}
			{error !== null ? (
				<p className="search-state error" role="status">
					{error}
				</p>
			) : busy ? (
				<p className="search-state" role="status">
					indexing…
				</p>
			) : files.length === 0 ? (
				<p className="search-state" role="status">
					No files indexed
				</p>
			) : displayList.length === 0 ? (
				<p className="search-state" role="status">
					No matches
				</p>
			) : (
				<div className="search-results" ref={listRef}>
					{primary.trim() === "" ? (
						<>
							<div className="quick-open-group-label">Recent</div>
							{recent
								.filter((p) => files.includes(p))
								.slice(0, RECENT_LIMIT)
								.map((path, index) => {
									const name = basename(path);
									const dir = path.startsWith(root)
										? path.slice(root.length).replace(/^\/+/, "")
										: path;
									const relDir = dir
										.slice(0, Math.max(0, dir.length - name.length))
										.replace(/\/+$/, "");
									const globalIndex = index;
									return (
										<button
											type="button"
											key={`recent-${path}`}
											className={
												globalIndex === active
													? "search-row active"
													: "search-row"
											}
											data-index={globalIndex}
											title={path}
											onClick={() => {
												recordRecent(path);
												onOpen(path);
												onClose();
											}}
											onMouseEnter={() => setActive(globalIndex)}
										>
											{openPaths.has(path) ? (
												<span className="quick-open-dot">•</span>
											) : null}
											<span className="search-file-name">{name}</span>
											<span className="search-file-dir">{relDir}</span>
										</button>
									);
								})}
							<div className="quick-open-group-label">All files</div>
							{mainList.map((path, i) => {
								const name = basename(path);
								const dir = path.startsWith(root)
									? path.slice(root.length).replace(/^\/+/, "")
									: path;
								const relDir = dir
									.slice(0, Math.max(0, dir.length - name.length))
									.replace(/\/+$/, "");
								const globalIndex =
									recent.filter((p) => files.includes(p)).slice(0, RECENT_LIMIT)
										.length + i;
								return (
									<button
										type="button"
										key={path}
										className={
											globalIndex === active
												? "search-row active"
												: "search-row"
										}
										data-index={globalIndex}
										title={path}
										onClick={() => {
											recordRecent(path);
											onOpen(path);
											onClose();
										}}
										onMouseEnter={() => setActive(globalIndex)}
									>
										{openPaths.has(path) ? (
											<span className="quick-open-dot">•</span>
										) : null}
										<span className="search-file-name">{name}</span>
										<span className="search-file-dir">{relDir}</span>
									</button>
								);
							})}
						</>
					) : (
						ranked.map((path, index) => {
							const name = basename(path);
							const dir = path.startsWith(root)
								? path.slice(root.length).replace(/^\/+/, "")
								: path;
							const relDir = dir
								.slice(0, Math.max(0, dir.length - name.length))
								.replace(/\/+$/, "");
							const nameMatches = matchPositions(name, primary) ?? [];
							const dirMatches = matchPositions(relDir, primary) ?? [];
							return (
								<button
									type="button"
									key={path}
									className={
										index === active ? "search-row active" : "search-row"
									}
									data-index={index}
									title={path}
									onClick={() => {
										recordRecent(path);
										onOpen(path);
										onClose();
									}}
									onMouseEnter={() => setActive(index)}
								>
									{openPaths.has(path) ? (
										<span className="quick-open-dot">•</span>
									) : null}
									<span className="search-file-name">
										{highlight(name, nameMatches)}
									</span>
									<span className="search-file-dir">
										{highlight(relDir, dirMatches)}
									</span>
								</button>
							);
						})
					)}
				</div>
			)}
			<div className="search-foot">
				<span>↑↓ move</span>
				<span>enter open</span>
				<span>esc close</span>
			</div>
		</div>
	);
}
