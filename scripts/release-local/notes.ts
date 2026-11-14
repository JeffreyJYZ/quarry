/**
 * The notes published with a release, taken from the commits since the last tag.
 *
 * The tag being cut lives on the server until `gh release create` makes it, so it cannot anchor the
 * range: the previous tag reachable from `commit` does, and the commits after it are this release.
 * Version bumps are dropped because they say nothing about the change.
 *
 * `commit` is passed in rather than read from HEAD: the notes are rendered after a build that takes
 * minutes, and a checkout that moved in the meantime used to add commits to a release whose artefact
 * was built from the earlier tree.
 */

import { run } from "./process";

export function notesFromGit(commit: string): string {
	try {
		const previous = run("git", ["describe", "--tags", "--abbrev=0", commit]).trim();
		const log = run("git", [
			"log",
			"--no-merges",
			"--pretty=format:%s",
			`${previous}..${commit}`,
		])
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "" && !/^chore: bump to /.test(line));
		if (log.length === 0) return `No user-visible changes since ${previous}.`;
		return [`Changes since ${previous}:`, "", ...log.map((line) => `- ${line}`)].join("\n");
	} catch {
		return "Local alpha build.";
	}
}
