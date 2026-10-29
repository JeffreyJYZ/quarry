export type SearchEntry = {
	/** The page title. */
	title: string;
	/** The nav group the page belongs to. */
	section: string;
	/** The route the result opens. */
	href: string;
	/** The heading the text was taken from, empty for the page's own text. */
	heading: string;
	/** Plain text of one block, trimmed for the result body. */
	body: string;
};

/** Rank a result for a query: title beats heading beats body, and an earlier hit beats a later one. */
export function score(entry: SearchEntry, query: string): number {
	const q = query.toLowerCase();
	const title = entry.title.toLowerCase();
	const heading = entry.heading.toLowerCase();
	const body = entry.body.toLowerCase();
	let total = 0;
	if (title === q) total += 60;
	else if (title.startsWith(q)) total += 40;
	else if (title.includes(q)) total += 26;
	if (heading === q) total += 24;
	else if (heading.includes(q)) total += 16;
	if (body.includes(q)) total += 10;
	return total;
}

/** The best matches for a query, best first, capped so the palette stays one screen long. */
export function search(entries: SearchEntry[], query: string, limit = 12): SearchEntry[] {
	const trimmed = query.trim();
	if (trimmed === "") return entries.slice(0, limit);
	return entries
		.map((entry) => ({ entry, rank: score(entry, trimmed) }))
		.filter((hit) => hit.rank > 0)
		.sort((a, b) => b.rank - a.rank)
		.slice(0, limit)
		.map((hit) => hit.entry);
}
