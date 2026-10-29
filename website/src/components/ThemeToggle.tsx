"use client";

import { useEffect, useState } from "react";

const KEY = "quarry-docs-theme";
type Theme = "dark" | "light";

/** Reads the theme the boot script already chose, then flips it and remembers the choice. */
export default function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("dark");

	useEffect(() => {
		const current = document.documentElement.dataset.theme;
		const stored = localStorage.getItem(KEY);
		setTheme(
			stored === "light" || stored === "dark"
				? stored
				: current === "light"
					? "light"
					: "dark",
		);
	}, []);

	const flip = () => {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		document.documentElement.dataset.theme = next;
		localStorage.setItem(KEY, next);
	};

	return (
		<button
			type="button"
			className="header-link"
			onClick={flip}
			aria-label={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
			title={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
		>
			{theme === "dark" ? (
				<svg
					width="15"
					height="15"
					viewBox="0 0 16 16"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.2"
					strokeLinecap="round"
				>
					<circle cx="8" cy="8" r="3.1" />
					<path d="M8 1.4v1.6M8 13v1.6M1.4 8H3M13 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
				</svg>
			) : (
				<svg
					width="15"
					height="15"
					viewBox="0 0 16 16"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" />
				</svg>
			)}
		</button>
	);
}
