import { transformQuery } from "@/lib/search/model";
import type { SearchOptions } from "@/lib/search/model";

/** Session-wide toggle + last-query state so the palette remembers across open/close. */
export const searchSession = {
	caseSensitive: false,
	regex: true,
	wholeWord: false,
	lastQuery: "",
};

export function invalidQuery(query: string, options: SearchOptions, wholeWord: boolean): boolean {
	if (!wholeWord) {
		return false;
	}
	const trimmedQuery = query.trim();
	if (trimmedQuery === "") {
		return false;
	}
	try {
		new RegExp(transformQuery(trimmedQuery, options));
		return false;
	} catch {
		return true;
	}
}
