/**
 * The process-backed half of release notes.
 *
 * git supplies the range: the last tag reachable from the commit being released, which exists locally
 * even though the tag being cut does not. gh supplies PR titles and bodies; the `(#NNN)` suffix in each
 * subject is the only link needed. Every gh call is optional to the release.
 */

import { composeNotes, type NotesSources, type PullRequest } from "./notes";
import { fail, REPO, run } from "./process";

export const processSources: NotesSources = {
	previousTag(commit: string): string {
		// An existing release tag points at its own commit: describe would name that tag and leave an
		// empty range. The release path has no tag at the commit yet and takes the other branch.
		const here = run("git", ["tag", "--points-at", commit]).trim();
		const anchor = here === "" ? commit : `${commit}^`;
		return run("git", ["describe", "--tags", "--abbrev=0", anchor]).trim();
	},
	subjects(commit: string, previous: string): string[] {
		return run("git", ["log", "--no-merges", "--pretty=format:%s", `${previous}..${commit}`])
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "");
	},
	pullRequest(number: number): PullRequest | null {
		const raw = run("gh", [
			"pr",
			"view",
			String(number),
			"--repo",
			REPO,
			"--json",
			"title,body",
		]);
		const parsed = JSON.parse(raw) as Partial<PullRequest>;
		return {
			title: typeof parsed.title === "string" ? parsed.title : "",
			body: typeof parsed.body === "string" ? parsed.body : "",
		};
	},
};

/** Notes for the range ending at `commit`; git failures leave the old minimal body. */
export function notesFromGit(commit: string, version: string): string {
	try {
		return composeNotes(commit, version, processSources);
	} catch {
		return "Local alpha build.";
	}
}

/** The version recorded at a tag, so a dry run never reads the working tree's already-bumped version. */
export function versionAtTag(tag: string): string {
	const raw = run("git", ["show", `${tag}:package.json`]);
	const version = (JSON.parse(raw) as { version?: unknown }).version;
	if (typeof version !== "string" || version === "") fail(`no version recorded at tag ${tag}`);
	return version;
}

/** Printable body for an existing tag; the release path uses `notesFromGit` with the built version. */
export function notesForTag(tag: string, commit: string = tag): string {
	return notesFromGit(commit, versionAtTag(tag));
}
