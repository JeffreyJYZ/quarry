/**
 * `latest.json` — the file an installed app polls — and the proof that the published one serves this
 * release.
 *
 * Publishing is asynchronous, so the check polls: the release URL answers 404 for a while after the
 * assets are uploaded, and reading that as a failure is how a good release looks broken.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
	manifestPlatforms,
	manifestProblem,
	manifestUrl,
	type PublishedManifest,
} from "../release-manifest";
import { notesFromGit } from "./notes";
import { assetUrl, LATEST, RELEASE_DIR } from "./paths";
import { arg, fail, log, REPO } from "./process";

export interface Manifest {
	version: string;
	notes: string;
	pub_date: string;
	platforms: Record<string, { signature: string; url: string }>;
}

/** Writes `latest.json`; the notes come from `--notes FILE` or the commits since the last tag. */
export function writeManifest(
	version: string,
	tag: string,
	signature: string,
	sha: string,
): Manifest {
	const entry = { signature, url: assetUrl(tag, "quarry.app.tar.gz") };
	const notesArg = arg("--notes");
	const latest: Manifest = {
		version,
		notes: notesArg !== null ? readFileSync(notesArg, "utf8") : "",
		pub_date: new Date().toISOString(),
		platforms: Object.fromEntries(manifestPlatforms().map((key) => [key, entry])),
	};
	execFileSync("mkdir", ["-p", RELEASE_DIR]);
	writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);

	if (notesArg === null) {
		latest.notes = notesFromGit(sha);
		writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);
	}
	return latest;
}

/** Polls the public manifest until it names `version`, or fails with the last reading. */
export async function verifyManifest(tag: string, version: string): Promise<void> {
	const url = manifestUrl(REPO, tag);
	log(`verifying the published manifest at ${url}`);
	let published: PublishedManifest = {};
	let lastError = "";
	for (let attempt = 0; attempt < 10; attempt += 1) {
		try {
			const response = await fetch(url, { redirect: "follow" });
			if (response.ok) {
				published = (await response.json()) as PublishedManifest;
				break;
			}
			lastError = `HTTP ${response.status}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}

	const problem = manifestProblem(published, version, manifestPlatforms());
	if (problem !== null) {
		fail(`${problem} at ${url}${lastError === "" ? "" : ` (${lastError})`}`);
	}
}
