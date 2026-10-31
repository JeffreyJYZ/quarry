import { useEffect, useRef, useState } from "react";

export function rowMatches(text: string, query: string): boolean {
	const trimmed = query.trim();
	if (trimmed === "") return true;
	return text.toLowerCase().includes(trimmed.toLowerCase());
}

export function filterSections(root: HTMLElement, query: string): number {
	const sections = root.querySelectorAll<HTMLElement>(".settings-section");
	let visible = 0;
	const blank = query.trim() === "";
	for (const section of sections) {
		const heading = section.querySelector<HTMLElement>("h3.settings-heading");
		const headingText = heading?.textContent ?? "";
		const headingMatch = blank ? true : rowMatches(headingText, query);
		const rows = section.querySelectorAll<HTMLElement>(":scope > .settings-row");
		let rowMatched = false;
		for (const row of rows) {
			const match = blank ? true : rowMatches(row.textContent ?? "", query);
			row.hidden = !match;
			if (match) rowMatched = true;
		}
		if (headingMatch) {
			for (const row of rows) row.hidden = false;
		}
		const hideSection = !headingMatch && !rowMatched;
		section.hidden = hideSection;
		if (!hideSection) visible += 1;
	}
	return visible;
}

export function useSettingsSearch(open: boolean, tab: string) {
	const [query, setQuery] = useState("");
	const bodyRef = useRef<HTMLDivElement | null>(null);
	const [matches, setMatches] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset query when open or tab changes
	useEffect(() => {
		setQuery("");
	}, [open, tab]);

	useEffect(() => {
		const root = bodyRef.current;
		if (root === null) return;
		setMatches(filterSections(root, query));
	});

	return { query, setQuery, bodyRef, matches };
}
