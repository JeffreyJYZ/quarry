/**
 * Query matching and replacement expansion, shared by the project palette and the in-file search.
 *
 * `String.replace` with a template string interprets `$&`, `` $` ``, `$'` and `$1` itself, so a
 * replacement assembled from captures by hand is the only way to keep those tokens from meaning
 * something the user did not type. Only `$$`, `$&`, a numbered group and `$<name>`/`${name}` are
 * references here; every other `$` is inserted as written.
 */

export type SearchOptions = {
	caseSensitive: boolean;
	regex: boolean;
	wholeWord: boolean;
};

/** A literal query, escaped so it means its own characters inside a pattern. */
function escapeQuery(query: string): string {
	return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The pattern one query compiles to; whole word wraps it in boundaries. */
export function querySource(query: string, options: SearchOptions): string {
	const source = options.regex ? query : escapeQuery(query);
	return options.wholeWord ? `\\b(?:${source})\\b` : source;
}

/** A fresh global matcher, or null when the pattern is invalid. */
export function searchRegex(query: string, options: SearchOptions): RegExp | null {
	try {
		return new RegExp(querySource(query, options), options.caseSensitive ? "g" : "gi");
	} catch {
		return null;
	}
}

/** The replacement text for one match: `$1`, `$<name>`/`${name}`, `$&`, `$$`; anything else literal. */
function expand(
	whole: string,
	captures: readonly (string | undefined)[],
	groups: Readonly<Record<string, string | undefined>> | undefined,
	template: string,
): string {
	let out = "";
	for (let index = 0; index < template.length; index += 1) {
		const character = template[index];
		if (character !== "$") {
			out += character;
			continue;
		}
		const next = template[index + 1];
		if (next === "$") {
			out += "$";
			index += 1;
			continue;
		}
		if (next === "&") {
			out += whole;
			index += 1;
			continue;
		}
		if (next !== undefined && next >= "0" && next <= "9") {
			let digits = next;
			let cursor = index + 2;
			while (
				cursor < template.length &&
				digits.length < 2 &&
				template[cursor] >= "0" &&
				template[cursor] <= "9"
			) {
				digits += template[cursor];
				cursor += 1;
			}
			// `$0` is the whole match, the same as the backend's replacement syntax.
			const group = Number(digits);
			out += group === 0 ? whole : (captures[group - 1] ?? "");
			index = cursor - 1;
			continue;
		}
		if (next === "<" || next === "{") {
			const close = template.indexOf(next === "<" ? ">" : "}", index + 2);
			if (close !== -1) {
				out += groups?.[template.slice(index + 2, close)] ?? "";
				index = close;
				continue;
			}
		}
		out += character;
	}
	return out;
}

/** Expand the replacement template from one executed match. */
export function expandReplacement(match: RegExpExecArray, template: string): string {
	return expand(match[0], match.slice(1), match.groups, template);
}

/** One edit of a replace-all: the range a match covers and the text that replaces it. */
export type TextChange = { from: number; to: number; insert: string };

/** Bound on the edits one replace-all builds, so a pathological pattern cannot flood the doc. */
const MAX_EDITS = 10_000;

/**
 * Every edit a replace-all makes over `text`.
 *
 * Matches are scanned from the live text so both modes share one matcher and a regex replacement
 * can expand the captures of the match it belongs to, which a position list cannot carry.
 */
export function replacementChanges(
	text: string,
	query: string,
	replacement: string,
	options: SearchOptions,
): TextChange[] {
	const re = searchRegex(query, options);
	if (re === null || query === "") {
		return [];
	}
	const changes: TextChange[] = [];
	re.lastIndex = 0;
	let match = re.exec(text);
	while (match !== null) {
		if (match[0].length === 0) {
			re.lastIndex += 1;
			match = re.exec(text);
			continue;
		}
		changes.push({
			from: match.index,
			to: match.index + match[0].length,
			insert: options.regex ? expandReplacement(match, replacement) : replacement,
		});
		if (changes.length >= MAX_EDITS) {
			break;
		}
		match = re.exec(text);
	}
	return changes;
}

/**
 * Apply one replacement to a single line. Regex mode expands the captures; literal mode inserts
 * the replacement verbatim, including any `$1` the user typed.
 */
export function applyReplacement(
	line: string,
	query: string,
	replacement: string,
	options: SearchOptions,
): string {
	if (query === "") {
		return line;
	}
	const re = searchRegex(query, options);
	if (re === null) {
		return line;
	}
	if (!options.regex) {
		return line.replace(re, () => replacement);
	}
	return line.replace(re, (...args: unknown[]) => {
		const last = args[args.length - 1];
		const groups =
			typeof last === "object" && last !== null
				? (last as Record<string, string | undefined>)
				: undefined;
		// The trailing arguments are the offset, the whole string and, when named groups exist,
		// the groups object; the captures sit between the match and those.
		const captures = args
			.slice(1, args.length - (groups === undefined ? 2 : 3))
			.map((value) => (typeof value === "string" ? value : undefined));
		return expand(String(args[0]), captures, groups, replacement);
	});
}
