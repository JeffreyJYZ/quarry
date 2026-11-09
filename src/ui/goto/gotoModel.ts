export type GotoMode = "class" | "symbol" | "recent";

export type Row = {
	key: string;
	label: string;
	detail: string;
	path: string;
	line: number;
	character: number;
};

export { TITLES } from "@/lib/consts/goto";

/** Files whose name or directory contains every whitespace-separated term of the query. */
export function filterRows(rows: Row[], query: string): Row[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return rows;
	return rows.filter((row) => {
		const haystack = `${row.label} ${row.detail}`.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}
