"use client";

import ThemeToggle from "@/components/ThemeToggle";
import { SEARCH_EVENT } from "@/components/SearchDialog";

/** The header's right side: search, the repository, the theme, and the phone-sized nav toggle. */
export default function HeaderControls({ repo }: { repo: string }) {
	return (
		<div className="header-links">
			<button
				type="button"
				className="header-search"
				aria-label="Search the docs"
				onClick={() => window.dispatchEvent(new Event(SEARCH_EVENT))}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 16 16"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
				>
					<circle cx="7" cy="7" r="4.3" />
					<path d="M10.2 10.2 14 14" />
				</svg>
				<span>Search</span>
				<span className="kbd">⌘K</span>
			</button>
			<a className="header-link header-github" href={repo} target="_blank" rel="noreferrer">
				<svg
					width="15"
					height="15"
					viewBox="0 0 16 16"
					aria-hidden="true"
					fill="currentColor"
				>
					<path d="M8 .8a7.2 7.2 0 0 0-2.28 14.03c.36.07.49-.16.49-.35v-1.2c-2 .44-2.42-.96-2.42-.96-.33-.84-.8-1.06-.8-1.06-.66-.45.05-.44.05-.44.72.05 1.1.74 1.1.74.64 1.1 1.69.78 2.1.6.07-.47.25-.79.46-.97-1.6-.18-3.28-.8-3.28-3.56 0-.79.28-1.43.74-1.93-.08-.18-.32-.92.07-1.9 0 0 .6-.2 1.98.74a6.9 6.9 0 0 1 3.6 0c1.37-.94 1.97-.74 1.97-.74.39.98.15 1.72.07 1.9.46.5.74 1.14.74 1.93 0 2.77-1.69 3.38-3.29 3.55.26.23.49.66.49 1.34v1.99c0 .19.13.43.5.35A7.2 7.2 0 0 0 8 .8z" />
				</svg>
				<span>GitHub</span>
			</a>
			<ThemeToggle />
			<button
				type="button"
				className="header-link menu-button"
				aria-label="Toggle the docs menu"
				onClick={() => {
					const root = document.documentElement;
					root.dataset.nav = root.dataset.nav === "open" ? "" : "open";
				}}
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 16 16"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
					strokeLinecap="round"
				>
					<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
				</svg>
			</button>
		</div>
	);
}
