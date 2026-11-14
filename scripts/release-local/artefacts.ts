/**
 * The three files a release ships, checked before anything is published.
 *
 * The signature carries the version that was signed. A failed build leaves the previous archive in
 * place, so without that check a release can publish last build's bytes under this version's name,
 * and the updater then reinstalls the old app forever.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { selectDmg } from "../release-manifest";
import { dmgPath, makeDmg } from "./dmg";
import { ARCHIVE, ARCHIVE_SIG, BUNDLE, DMG_DIR } from "./paths";
import { fail } from "./process";

export interface Artefacts {
	archive: string;
	signatureFile: string;
	dmg: string;
	signature: string;
}

/** Ensures the dmg exists, then verifies the archive, signature and binary are the same build. */
export function collectArtefacts(version: string): Artefacts {
	if (dmgPath(version) === null) {
		if (existsSync(DMG_DIR)) {
			const { error } = selectDmg(readdirSync(DMG_DIR), version);
			if (error !== null) fail(error);
		}
		makeDmg(version);
	}

	const dmg = dmgPath(version);
	if (!existsSync(ARCHIVE)) fail(`missing updater archive: ${ARCHIVE}`);
	if (!existsSync(ARCHIVE_SIG)) fail(`missing updater signature: ${ARCHIVE_SIG}`);
	if (dmg === null) fail(`missing dmg for ${version} under ${DMG_DIR}`);

	const signature = readFileSync(ARCHIVE_SIG, "utf8").trim();
	if (signature === "") fail("the updater signature is empty");
	const signed = Buffer.from(signature, "base64").toString("utf8");
	const signedVersion = /version:(\S+)/.exec(signed)?.[1];
	if (signedVersion !== version) {
		fail(
			`the updater archive was signed for ${signedVersion ?? "an unknown version"}, not ${version}: rebuild before publishing`,
		);
	}
	const archiveMtime = statSync(ARCHIVE).mtimeMs;
	const appMtime = statSync(join(BUNDLE, "quarry.app", "Contents", "MacOS", "quarry")).mtimeMs;
	if (archiveMtime < appMtime) {
		fail("the updater archive is older than the app binary: rebuild before publishing");
	}

	return { archive: ARCHIVE, signatureFile: ARCHIVE_SIG, dmg, signature };
}
