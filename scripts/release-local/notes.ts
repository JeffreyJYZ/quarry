/**
 * Composing release notes from merged pull requests.
 *
 * A release body used to be a list of commit subjects: it told a reader which files moved, not what
 * changed for them. Every subject carries its PR number, so the PR title fills the one-line index and
 * its body supplies the detail under the entry. GitHub is optional: a release that publishes with a
 * plain subject list is worth more than no release at all, so every lookup degrades to that body.
 */

export interface PullRequest {
	title: string;
	body: string;
}

/** What composition needs from the outside; the release wires git and gh, tests wire fixtures. */
export interface NotesSources {
	previousTag(commit: string): string;
	subjects(commit: string, previous: string): string[];
	pullRequest(number: number): PullRequest | null;
}

export type Group = "fixes" | "features" | "under";

export interface Entry {
	subject: string;
	number: number | null;
	group: Group | null;
}

const HEAVY = new Set(["chore", "test", "docs", "refactor", "style", "ci", "build", "perf"]);

const GROUPS: Array<{ group: Group; heading: string }> = [
	{ group: "fixes", heading: "Fixes" },
	{ group: "features", heading: "Features" },
	{ group: "under", heading: "Under the hood" },
];

/** A version bump says nothing to a reader and belongs in no group. */
export function isVersionBump(subject: string): boolean {
	return /^chore(?:\([^)]*\))?:\s*bump to\b/i.test(subject);
}

/** The prefix decides the group; that prefix is present even when gh cannot be reached. */
export function groupFor(subject: string): Group | null {
	if (isVersionBump(subject)) return null;
	const type = /^([a-z]+)(?:\([^)]*\))?:/i.exec(subject)?.[1]?.toLowerCase() ?? "";
	if (type === "fix" || type === "hotfix") return "fixes";
	if (HEAVY.has(type)) return "under";
	return "features";
}

export function prNumber(subject: string): number | null {
	const match = /\(#(\d+)\)\s*$/.exec(subject);
	return match === null ? null : Number(match[1]);
}

export function entryFrom(subject: string): Entry {
	return { subject, number: prNumber(subject), group: groupFor(subject) };
}

/** The first paragraph that is prose, not a heading, list or fence. */
export function firstProseParagraph(body: string): string {
	for (const block of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
		const lines = block
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "");
		if (lines.length === 0) continue;
		if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|```|>)/.test(lines[0] ?? "")) continue;
		return lines.join(" ");
	}
	return "";
}

/**
 * The display title: no `type(scope):` prefix (the section says it) and no trailing `(#NNN)`, which
 * the entry appends itself.
 */
function titleOf(pr: PullRequest | null, subject: string): string {
	if (pr === null) return subject.replace(/\s*\(#\d+\)\s*$/, "");
	const title = pr.title.trim() || subject;
	return title.replace(/\s*\(#\d+\)\s*$/, "").replace(/^[a-z]+(?:\([^)]*\))?:\s*/i, "");
}

/**
 * The index at the top: a count and the displayed titles, nothing copied from the bodies. It cannot
 * disagree with the sections below because both come from the same title strings.
 */
export function summaryIndex(titles: string[]): string {
	const count = titles.length === 1 ? "One" : titles.length === 2 ? "Two" : String(titles.length);
	return `${count} change${titles.length === 1 ? "" : "s"}: ${titles.join("; ")}.`;
}

/** One line, with the dmg name built from the version of the tag being released. */
export function updateLine(version: string): string {
	return `quarry self-updates; restart when a new version is offered. For a manual install, download quarry_${version}_universal.dmg from this release.`;
}

/**
 * The markdown body for one range.
 *
 * The summary leads, the grouped entries follow, and the update line closes. A PR that cannot be read
 * stays a bare subject; if none can be read the whole body is today's subject list, with a line saying
 * why there is no summary.
 */
export function composeNotes(commit: string, version: string, sources: NotesSources): string {
	const previous = sources.previousTag(commit);
	const subjects = sources.subjects(commit, previous);
	const entries = subjects.map(entryFrom).filter((entry) => entry.group !== null);
	if (entries.length === 0) return `No user-visible changes since ${previous}.`;

	const prs = new Map<number, PullRequest>();
	const seen = new Set<number>();
	for (const entry of entries) {
		if (entry.number === null || seen.has(entry.number)) continue;
		seen.add(entry.number);
		try {
			const pr = sources.pullRequest(entry.number);
			if (pr !== null) prs.set(entry.number, pr);
		} catch {
			// an unreadable PR is a bare subject entry, never a failed release
		}
	}

	const lines: string[] = [];
	if (prs.size === 0) {
		lines.push("Summary unavailable: could not read the merged pull requests.", "");
		lines.push(...entries.map((entry) => `- ${entry.subject}`));
		lines.push("", "## How to update", "", updateLine(version));
		return lines.join("\n");
	}

	const displayed = entries.map((entry) => ({
		entry,
		title: titleOf(
			entry.number === null ? null : (prs.get(entry.number) ?? null),
			entry.subject,
		),
	}));
	lines.push(summaryIndex(displayed.map((item) => item.title)), "");

	for (const { group, heading } of GROUPS) {
		const inGroup = displayed.filter((item) => item.entry.group === group);
		if (inGroup.length === 0) continue;
		lines.push(`## ${heading}`, "");
		for (const { entry, title } of inGroup) {
			const pr = entry.number === null ? null : (prs.get(entry.number) ?? null);
			const suffix = entry.number === null ? "" : ` (#${entry.number})`;
			lines.push(`- ${title}${suffix}`);
			const paragraph = pr === null ? "" : firstProseParagraph(pr.body);
			if (paragraph !== "") lines.push("", `  ${paragraph}`);
			lines.push("");
		}
	}

	lines.push("## How to update", "", updateLine(version));
	return lines.join("\n");
}
