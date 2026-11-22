import type { NoteBlock } from "@/lib/updates/notes";

/**
 * Verbatim body of `quarry-alpha107`, read with `gh release view quarry-alpha107 --json body`.
 * Kept as a fixture so parser and panel tests exercise the shape a release actually publishes:
 * a summary line, two grouping headings, numbered entries with indented paragraphs, and an
 * update paragraph with no entry above it.
 */
export const ALPHA107_BODY = [
	"3 changes: notes with a summary, grouped entries and an update line; the initialize panel invites instead of diagnosing; let the What's new panel read the release it asks for.",
	"",
	"## Fixes",
	"",
	"- the initialize panel invites instead of diagnosing (#236)",
	"",
	'  The panel had two screens — a button, then the picker — and the heading said **"This folder is not a project"** on both, so the second screen asked you to fill in a form for something it had just told you does not exist.',
	"",
	"- let the What's new panel read the release it asks for (#235)",
	"",
	'  The panel said *"No release notes published for this version"* on a release that has notes, and `latest.json` carried them too.',
	"",
	"## Features",
	"",
	"- notes with a summary, grouped entries and an update line (#237)",
	"",
	"  Published bodies were a bare `git log --pretty=format:%s` dump. The regression has a specific origin: `e37f6bd` built `notesFromGit` on commit subjects only, and `git log -S 'gh pr view' -- scripts` shows no code ever fetched PR bodies — the later refactors copied that shape faithfully.",
	"",
	"## How to update",
	"",
	"quarry self-updates; restart when a new version is offered. For a manual install, download quarry_0.1.0-alpha.107_universal.dmg from this release.",
].join("\n");

/** The four block kinds the fixture must produce, with inline markdown already removed. */
export const ALPHA107_BLOCKS: NoteBlock[] = [
	{
		kind: "lead",
		text: "3 changes: notes with a summary, grouped entries and an update line; the initialize panel invites instead of diagnosing; let the What's new panel read the release it asks for.",
	},
	{ kind: "heading", text: "Fixes" },
	{ kind: "entry", text: "the initialize panel invites instead of diagnosing", number: "236" },
	{
		kind: "body",
		text: 'The panel had two screens — a button, then the picker — and the heading said "This folder is not a project" on both, so the second screen asked you to fill in a form for something it had just told you does not exist.',
	},
	{ kind: "entry", text: "let the What's new panel read the release it asks for", number: "235" },
	{
		kind: "body",
		text: 'The panel said "No release notes published for this version" on a release that has notes, and latest.json carried them too.',
	},
	{ kind: "heading", text: "Features" },
	{
		kind: "entry",
		text: "notes with a summary, grouped entries and an update line",
		number: "237",
	},
	{
		kind: "body",
		text: "Published bodies were a bare git log --pretty=format:%s dump. The regression has a specific origin: e37f6bd built notesFromGit on commit subjects only, and git log -S 'gh pr view' -- scripts shows no code ever fetched PR bodies — the later refactors copied that shape faithfully.",
	},
	{ kind: "heading", text: "How to update" },
	{
		kind: "body",
		text: "quarry self-updates; restart when a new version is offered. For a manual install, download quarry_0.1.0-alpha.107_universal.dmg from this release.",
	},
];
