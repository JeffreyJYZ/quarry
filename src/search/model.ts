import { directoryOf, fileName } from "@/problems/model";
import type { SearchMatch, SearchReport } from "@/project/api";

/** Rows the palette renders no matter how many matches the backend returned. */
export const SEARCH_RENDER_LIMIT = 300;

/** How much of one matched line a row keeps; CSS clamps it to the real palette width. */
const LINE_CLIP = 240;

export type SearchRow = {
	match: SearchMatch;
	/** Position in the flat, capped result list; the palette's highlight index. */
	index: number;
};

export type SearchGroup = {
	path: string;
	name: string;
	dir: string;
	rows: SearchRow[];
};

/**
 * Group matches by file in backend order, capped so a huge result stays cheap to render. The cap
 * applies across files, so one hot file cannot spend the whole list on its own.
 */
export function groupMatches(
	matches: SearchMatch[],
	limit: number = SEARCH_RENDER_LIMIT,
): SearchGroup[] {
	const groups: SearchGroup[] = [];
	const byPath = new Map<string, SearchGroup>();
	let index = 0;
	for (const match of matches) {
		if (index >= limit) {
			break;
		}
		let group = byPath.get(match.path);
		if (group === undefined) {
			group = {
				path: match.path,
				name: fileName(match.path),
				dir: directoryOf(match.path),
				rows: [],
			};
			byPath.set(match.path, group);
			groups.push(group);
		}
		group.rows.push({ match, index });
		index += 1;
	}
	return groups;
}

/** Leading indentation is noise in a one-line preview, and a minified line would blow the row up. */
export function clipLine(text: string): string {
	const trimmed = text.trimStart();
	return trimmed.length > LINE_CLIP ? `${trimmed.slice(0, LINE_CLIP)}…` : trimmed;
}

/** `12 results · 3 ms`, or `300+ results (truncated) · 5 ms` when the backend hit its cap. */
export function resultSummary(report: SearchReport, rendered: number): string {
	const total = report.truncated ? `${rendered}+` : `${rendered}`;
	const noun = !report.truncated && rendered === 1 ? "result" : "results";
	const suffix = report.truncated ? " (truncated)" : "";
	return `${total} ${noun}${suffix} · ${report.durationMs} ms`;
}
