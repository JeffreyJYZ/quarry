import { directoryOf, fileName } from "@/lib/project/paths";
import type { SearchMatch, SearchReport } from "@/lib/project/api";

import { SEARCH_RENDER_LIMIT } from "@/lib/consts/search";
import { applyReplacement } from "@/lib/search/replace";
import type { SearchOptions } from "@/lib/search/replace";

/** Rows the palette renders no matter how many matches the backend returned. */
export { SEARCH_RENDER_LIMIT } from "@/lib/consts/search";

/** How much of one matched line a row keeps; CSS clamps it to the real palette width. */
const LINE_CLIP = 240;

export type { SearchOptions } from "@/lib/search/replace";

export { applyReplacement } from "@/lib/search/replace";

const encoder = new TextEncoder();

/**
 * The editor's reveal target for a search match.
 *
 * A match is reported with a 1-based line and a 1-based byte column, because that is what ripgrep
 * prints and what its own matcher counts; the reveal target counts from 0 in characters. The byte
 * column is walked over `text` instead of being decremented, so a hit after a multi-byte character
 * does not land several columns to its right.
 */
export function revealTarget(
	line: number,
	column: number,
	text: string,
): { line: number; character: number } {
	const limit = column - 1;
	let bytes = 0;
	let character = 0;
	for (const symbol of text) {
		if (bytes >= limit) break;
		bytes += encoder.encode(symbol).length;
		character += symbol.length;
	}
	return { line: line - 1, character };
}

export { isStaleSearch } from "@/lib/search/stale";

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

/**
 * Build the query string sent to the backend. Whole word wraps as `\b(?:<q>)\b`; otherwise the raw
 * text is passed through unchanged (the backend now owns regex parsing and the flags).
 */
export function transformQuery(raw: string, options: SearchOptions): string {
	if (options.wholeWord) {
		return `\\b(?:${raw})\\b`;
	}
	return raw;
}

/** Flags sent alongside the query. `.*` off => fixedStrings true; whole word forces fixedStrings false. */
export function searchFlags(options: SearchOptions): {
	caseSensitive: boolean;
	fixedStrings: boolean;
} {
	return {
		caseSensitive: options.caseSensitive,
		fixedStrings: options.wholeWord ? false : !options.regex,
	};
}

/** `12 results in 3 files · 5 ms`, or `12+ results in 3 files (truncated) · 5 ms`. */
export function resultSummary(report: SearchReport, rendered: number, fileCount: number): string {
	const total = report.truncated ? `${rendered}+` : `${rendered}`;
	const suffix = report.truncated ? " (truncated)" : "";
	return `${total} results in ${fileCount} files${suffix} · ${report.durationMs} ms`;
}

/** Cap on preview lines. */
import { PREVIEW_LIMIT } from "@/lib/consts/search";

export { PREVIEW_LIMIT } from "@/lib/consts/search";

export type PreviewLine = {
	path: string;
	line: number;
	oldText: string;
	newText: string;
};

export type PreviewSnapshot = {
	query: string;
	replacement: string;
	lines: PreviewLine[];
	truncated: boolean;
};

/**
 * Apply one replacement to a single line. Regex mode honours `$1`/`${name}` capture references;
 * literal mode inserts the replacement verbatim. Toggles come through options.
 */
export function buildPreview(
	matches: { path: string; line: number; text: string }[],
	query: string,
	replacement: string,
	options: SearchOptions,
	limit: number = PREVIEW_LIMIT,
): { lines: PreviewLine[]; truncated: boolean } {
	const lines: PreviewLine[] = [];
	let truncated = false;
	for (const m of matches) {
		if (lines.length >= limit) {
			truncated = true;
			break;
		}
		lines.push({
			path: m.path,
			line: m.line,
			oldText: m.text,
			newText: applyReplacement(m.text, query, replacement, options),
		});
	}
	if (matches.length > limit) {
		truncated = true;
	}
	return { lines, truncated };
}

export function isPreviewStale(
	snapshot: { query: string; replacement: string } | null,
	query: string,
	replacement: string,
): boolean {
	if (snapshot === null) {
		return true;
	}
	return snapshot.query !== query || snapshot.replacement !== replacement;
}
