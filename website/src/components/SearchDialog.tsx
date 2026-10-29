"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { search, type SearchEntry } from "@/lib/search";

/** Opens the palette from anywhere, so the header button and Cmd+K share one door. */
export const SEARCH_EVENT = "quarry:search";

export default function SearchDialog() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [entries, setEntries] = useState<SearchEntry[] | null>(null);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const results = useMemo(
		() => (entries === null ? [] : search(entries, query)),
		[entries, query],
	);

	useEffect(() => {
		const openPalette = () => {
			setOpen(true);
			setQuery("");
			setActive(0);
		};
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				openPalette();
			}
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener(SEARCH_EVENT, openPalette);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener(SEARCH_EVENT, openPalette);
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	useEffect(() => {
		if (!open || entries !== null) return;
		let live = true;
		void fetch("/search-index.json")
			.then((response) => (response.ok ? response.json() : []))
			.then((data: SearchEntry[]) => {
				if (live) setEntries(data);
			})
			.catch(() => {
				if (live) setEntries([]);
			});
		return () => {
			live = false;
		};
	}, [open, entries]);

	useEffect(() => {
		if (!open) return;
		inputRef.current?.focus();
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);

	useEffect(() => {
		setActive(0);
	}, []);

	useEffect(() => {
		const item = listRef.current?.children[active];
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);

	if (!open) return null;

	const choose = (entry: SearchEntry | undefined) => {
		if (entry === undefined) return;
		setOpen(false);
		router.push(entry.href);
	};

	return (
		<div className="search-scrim">
			<button
				type="button"
				className="search-backdrop"
				aria-label="Close search"
				onClick={() => setOpen(false)}
			/>
			<div
				className="search-panel"
				role="dialog"
				aria-modal="true"
				aria-label="Search the docs"
			>
				<div className="search-input-row">
					<svg
						width="15"
						height="15"
						viewBox="0 0 16 16"
						aria-hidden="true"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.4"
					>
						<circle cx="7" cy="7" r="4.3" />
						<path d="M10.2 10.2 14 14" />
					</svg>
					<input
						ref={inputRef}
						className="search-input"
						placeholder="Search the docs"
						aria-label="Search the docs"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setActive((current) => Math.min(current + 1, results.length - 1));
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setActive((current) => Math.max(current - 1, 0));
							}
							if (event.key === "Enter") {
								event.preventDefault();
								choose(results[active]);
							}
						}}
					/>
					<span className="kbd">esc</span>
				</div>
				{results.length === 0 ? (
					<p className="search-empty">
						{entries === null ? "Loading the index…" : `Nothing matches “${query}”.`}
					</p>
				) : (
					<ul className="search-results" ref={listRef}>
						{results.map((entry, index) => (
							<li key={`${entry.href}#${entry.heading}:${entry.body.slice(0, 24)}`}>
								<button
									type="button"
									className="search-result"
									aria-current={index === active ? "true" : undefined}
									onMouseEnter={() => setActive(index)}
									onClick={() => choose(entry)}
								>
									<span className="search-result-title">
										{entry.heading === "" ? entry.title : entry.heading}
									</span>
									<span className="search-result-where">
										{entry.section} · {entry.title}
									</span>
									<span className="search-result-body">{entry.body}</span>
								</button>
							</li>
						))}
					</ul>
				)}
				<div className="search-foot">
					<span>
						<span className="kbd">↑</span>
						<span className="kbd">↓</span> to move
					</span>
					<span>
						<span className="kbd">↵</span> to open
					</span>
				</div>
			</div>
		</div>
	);
}
