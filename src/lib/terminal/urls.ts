/**
 * Finding web addresses in terminal output.
 *
 * The emulator hands over a line of text and asks where the links are, so this is a plain scan with
 * no knowledge of the grid: the caller turns the character offsets into cells.
 *
 * Only `http` and `https` are recognised. A bare `www.` host and a `file:` path both look like a link
 * and neither is, and opening the wrong one from a shell prompt is worse than not offering it.
 */

export type FoundUrl = { start: number; end: number; url: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/g;

/** Punctuation a sentence ends with, which the link itself does not own. */
const SENTENCE_END = new Set([".", ",", ";", ":", "!", "?", "'", '"', "`"]);

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function count(text: string, needle: string): number {
	let total = 0;
	for (const char of text) if (char === needle) total += 1;
	return total;
}

/**
 * Trailing brackets are the link's own only when it opened them, so `(see http://a/b)` keeps the
 * parenthesis out while `http://a/b_(c)` keeps it in.
 */
function trimTrail(raw: string): string {
	let text = raw;
	for (;;) {
		const last = text.at(-1) ?? "";
		if (last === "") return text;
		if (SENTENCE_END.has(last)) {
			text = text.slice(0, -1);
			continue;
		}
		const opener = CLOSERS[last];
		if (opener === undefined) return text;
		if (count(text, opener) >= count(text, last)) return text;
		text = text.slice(0, -1);
	}
}

/** Every web address in one line, in the order it appears. Character offsets, not cells. */
export function findUrls(text: string): FoundUrl[] {
	const found: FoundUrl[] = [];
	for (const match of text.matchAll(URL_PATTERN)) {
		const start = match.index ?? 0;
		const url = trimTrail(match[0]);
		// `http://` alone is a scheme, not an address worth a link.
		if (url.length <= "https://".length) continue;
		found.push({ start, end: start + url.length, url });
	}
	return found;
}
