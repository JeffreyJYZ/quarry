import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listFiles } from "@/project/api";
import { describeError } from "@/project/errors";
import { basename, rankFiles } from "@/quickopen/rank";

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

export default function QuickOpen({ root, openPaths, onOpen, onClose }: Props) {
	const [query, setQuery] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const fetchFiles = useCallback(
		async (force: boolean) => {
			const cached = cache.get(root);
			if (!force && cached !== undefined && Date.now() - cached.fetchedAt < STALE_MS) {
				setFiles(cached.files);
				return;
			}
			setBusy(true);
			setError(null);
			try {
				const next = await listFiles(root);
				cache.set(root, { files: next, fetchedAt: Date.now() });
				setFiles(next);
			} catch (failure) {
				setError(describeError(failure));
			} finally {
				setBusy(false);
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
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const ranked = useMemo(() => {
		const q = query.trim();
		if (q === "") {
			const recentPaths = recent.filter((path) => files.includes(path));
			return recentPaths.slice(0, RECENT_LIMIT);
		}
		return rankFiles(files, q);
	}, [files, query]);

	// active resets on query change via the input handler above.

	useEffect(() => {
		const host = listRef.current;
		if (host === null) return;
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const move = (step: number) => {
		if (ranked.length === 0) return;
		setActive((current) => (current + step + ranked.length) % ranked.length);
	};

	const submit = () => {
		const path = ranked[active];
		if (path === undefined) return;
		recordRecent(path);
		onOpen(path);
		onClose();
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
			) : ranked.length === 0 ? (
				<p className="search-state" role="status">
					No matches
				</p>
			) : (
				<div className="search-results" ref={listRef}>
					{ranked.map((path, index) => {
						const name = basename(path);
						const dir = path.startsWith(root)
							? path.slice(root.length).replace(/^\/+/, "")
							: path;
						const relDir = dir
							.slice(0, Math.max(0, dir.length - name.length))
							.replace(/\/+$/, "");
						return (
							<button
								type="button"
								key={path}
								className={index === active ? "search-row active" : "search-row"}
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
								<span className="search-file-name">{name}</span>
								<span className="search-file-dir">{relDir}</span>
							</button>
						);
					})}
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
