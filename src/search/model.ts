import { directoryOf, fileName } from "@/problems/model";
import type { SearchMatch, SearchReport } from "@/project/api";

/** Rows the palette renders no matter how many matches the backend returned. */
export const SEARCH_RENDER_LIMIT = 300;

/** How much of one matched line a row keeps; CSS clamps it to the real palette width. */
const LINE_CLIP = 240;

export type SearchOptions = {
	caseSensitive: boolean;
	regex: boolean;
	wholeWord: boolean;
};

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
export const PREVIEW_LIMIT = 200;

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
export function applyReplacement(
	line: string,
	query: string,
	replacement: string,
	options: SearchOptions,
): string {
	if (options.regex) {
		const flags = options.caseSensitive ? "g" : "gi";
		// whole word handled by transformQuery already; here query is already transformed? We pass raw query.
		let re: RegExp;
		try {
			const source = options.wholeWord ? `\\b(?:${query})\\b` : query;
			re = new RegExp(source, flags);
		} catch {
			return line;
		}
		const repl = replacement.replace(/\$\{(\w+)\}/g, "$<$1>");
		return line.replace(re, repl);
	}
	// literal
	if (query === "") {
		return line;
	}
	const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const source = options.wholeWord ? `\\b(?:${escaped})\\b` : escaped;
	const re = new RegExp(source, options.caseSensitive ? "g" : "gi");
	return line.replace(re, () => replacement);
}

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
