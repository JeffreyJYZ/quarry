/**
 * Getting the release onto GitHub: create or edit it, then upload one asset per call.
 *
 * One asset per call, retried, so a failure names the tag and the file instead of leaving a release
 * whose assets are only partly there.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isStableTag } from "../release-manifest";
import { uploadAssets } from "../release-publish";
import type { Artefacts } from "./artefacts";
import type { Manifest } from "./manifest";
import { LATEST, RELEASE_DIR } from "./paths";
import { log, run } from "./process";

export function publishRelease(
	tag: string,
	version: string,
	latest: Manifest,
	artefacts: Artefacts,
): void {
	const dmgPathValue = artefacts.dmg;
	const assets = [
		{ path: artefacts.archive, name: "quarry.app.tar.gz" },
		{ path: artefacts.signatureFile, name: "quarry.app.tar.gz.sig" },
		{ path: dmgPathValue, name: dmgPathValue.slice(dmgPathValue.lastIndexOf("/") + 1) },
		{ path: LATEST, name: "latest.json" },
	];

	const exists = (() => {
		try {
			run("gh", ["release", "view", tag, "--json", "tagName"]);
			return true;
		} catch {
			return false;
		}
	})();

	if (exists) {
		log(`release ${tag} exists, replacing assets`);
		run("gh", ["release", "edit", tag, "--notes", latest.notes]);
	} else {
		log(`creating release ${tag}`);
		const notesFile = join(RELEASE_DIR, "notes.md");
		writeFileSync(notesFile, latest.notes);
		const createArgs = [
			"release",
			"create",
			tag,
			"--title",
			`quarry ${version}`,
			"--notes-file",
			notesFile,
		];
		if (isStableTag(tag)) createArgs.push("--latest");
		run("gh", createArgs);
	}

	uploadAssets(run, tag, assets);
}
