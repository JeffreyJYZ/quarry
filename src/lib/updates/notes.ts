/**
 * Release notes: what changed in a version, taken from that version's GitHub release.
 *
 * The notes are written by `scripts/release-local.ts` from the commits since the previous tag, so this
 * module only maps a version to its release tag, fetches the body once, and turns the markdown into the
 * short list the panel draws. Nothing here renders markdown: the body is a commit list, and a line
 * per entry is what makes it readable in a 300px panel.
 */

const REPOSITORY = "JeffreyJYZ/quarry";

/** `0.1.0-alpha.76` → `quarry-alpha76`, `1.2.3` → `v1.2.3`. */
export function notesTagFor(version: string): string {
	const alpha = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
	if (alpha !== null) return `quarry-alpha${alpha[2]}`;
	return `v${version}`;
}

/**
 * The lines of a release body worth showing.
 *
 * Headings and bullets lose their markers, code fences and blank lines are dropped, and `**bold**`
 * keeps its words. A body of only commit subjects therefore reads as a plain list of changes.
 */
export function parseNotes(markdown: string): string[] {
	const lines: string[] = [];
	let inFence = false;
	for (const raw of markdown.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence || line === "") continue;
		const cleaned = line
			.replace(/^#{1,6}\s*/, "")
			.replace(/^[-*+]\s+/, "")
			.replace(/^\d+\.\s+/, "")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.trim();
		if (cleaned === "") continue;
		lines.push(cleaned);
	}
	return lines;
}

export type NotesFetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** The notes for one version, or `null` when the release or its body cannot be read. */
export async function fetchReleaseNotes(
	version: string,
	fetchImpl: NotesFetch = fetch as unknown as NotesFetch,
): Promise<string[] | null> {
	const tag = notesTagFor(version);
	try {
		const response = await fetchImpl(
			`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`,
		);
		if (!response.ok) return null;
		const body = (await response.json()) as { body?: unknown };
		if (typeof body.body !== "string") return null;
		const notes = parseNotes(body.body);
		return notes.length === 0 ? null : notes;
	} catch {
		return null;
	}
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
