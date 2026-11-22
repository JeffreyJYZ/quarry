/**
 * Release notes: what changed in a version, taken from that version's GitHub release.
 *
 * The notes are written by `scripts/release-local.ts` from the commits since the previous tag, so this
 * module only maps a version to its release tag, fetches the body once, and parses the markdown into
 * blocks. The panel renders each block by kind, so structure survives from release body to screen.
 */

const REPOSITORY = "JeffreyJYZ/quarry";

/** One thing the panel draws. The kind is what decides its weight, dot and spacing. */
export type NoteBlock =
	| { kind: "lead"; text: string }
	| { kind: "heading"; text: string }
	| { kind: "entry"; text: string; number: string | null }
	| { kind: "body"; text: string };

/** `0.1.0-alpha.76` → `quarry-alpha76`, `1.2.3` → `v1.2.3`. */
export function notesTagFor(version: string): string {
	const alpha = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
	if (alpha !== null) return `quarry-alpha${alpha[2]}`;
	return `v${version}`;
}

/**
 * Markdown that must not reach the DOM: code loses its backticks, emphasis loses its asterisks, and a
 * link keeps only the words a reader needs. Done here so the panel can render plain text, never HTML.
 */
function stripInline(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1");
}

const LEAD = /^\d+\s+changes?\b/i;
const BULLET = /^(?:[-*+]|\d+\.)\s+/;
const PR_NUMBER = /\s*\((?:#)?(\d+)\)$/;

/**
 * A real release body: a summary line, `##` sections, `- title (#NNN)` entries and indented paragraphs.
 * The first qualifying plain line is the lead; every later plain line is a body under the entry before
 * it, or a loose body when no entry precedes it (the "How to update" paragraph).
 */
export function parseNotes(markdown: string): NoteBlock[] {
	const blocks: NoteBlock[] = [];
	let inFence = false;
	let seenStructure = false;

	for (const raw of markdown.split("\n")) {
		if (raw.trim().startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const line = raw.trim();
		if (line === "") continue;

		if (/^#{1,6}\s+/.test(line)) {
			blocks.push({ kind: "heading", text: stripInline(line.replace(/^#{1,6}\s+/, "")) });
			seenStructure = true;
			continue;
		}

		if (BULLET.test(line)) {
			const text = stripInline(line.replace(BULLET, ""));
			const match = PR_NUMBER.exec(text);
			blocks.push({
				kind: "entry",
				text: match === null ? text : text.slice(0, match.index).trimEnd(),
				number: match?.[1] ?? null,
			});
			seenStructure = true;
			continue;
		}

		const text = stripInline(line);
		if (blocks.length === 0 && !seenStructure && (LEAD.test(text) || text.endsWith(":"))) {
			blocks.push({ kind: "lead", text });
			continue;
		}
		blocks.push({ kind: "body", text });
	}
	return blocks;
}

export type NotesFetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** How long a release lookup may take before the panel is told it failed. */
export const NOTES_TIMEOUT_MS = 8000;

/**
 * The blocks for one version, `[]` for a release whose body has nothing to show, or `null` when the
 * release or its body cannot be read. The panel says a different thing for the last two.
 */
export async function fetchReleaseNotes(
	version: string,
	fetchImpl: NotesFetch = fetch as unknown as NotesFetch,
	timeoutMs: number = NOTES_TIMEOUT_MS,
): Promise<NoteBlock[] | null> {
	const tag = notesTagFor(version);
	try {
		const response = await withTimeout(
			fetchImpl(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`),
			timeoutMs,
		);
		if (!response.ok) return null;
		const body = (await withTimeout(response.json(), timeoutMs)) as { body?: unknown };
		if (typeof body.body !== "string") return null;
		return parseNotes(body.body);
	} catch {
		return null;
	}
}

/**
 * `promise`, or a rejection once `ms` has passed.
 *
 * A request that stalls never settles, and the panel that awaits it would sit on "Loading notes…" for
 * the rest of the session: the lookup happens while an update is already offered, so saying "no notes"
 * after a bounded wait is worth more than an accurate answer that may never arrive.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

export const NOTES_SEEN_KEY = "quarry.releaseNotes.seen";

/**
 * Whether the first launch on `current` should show what changed.
 *
 * A first install has nothing to compare against, so it stays quiet; the panel is for the launch after
 * an update, which is the only moment "what's new" answers a question the user actually has.
 */
export function shouldShowWhatsNew(current: string, seen: string | null): boolean {
	if (seen === null) return false;
	return seen !== current;
}
