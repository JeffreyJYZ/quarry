/**
 * Fast release: build on this Mac and publish macOS artefacts directly.
 *
 * CI builds every platform and takes ten minutes or more; an alpha does not need that. This script
 * builds the signed bundle here, writes `latest.json` for the updater, publishes the release and then
 * proves the public URL serves the version it just published. Full multi-platform builds stay on CI
 * for `quarry-beta*` and `v*` tags.
 *
 * Usage: bun scripts/release-local.ts [--tag quarry-alphaN] [--skip-build] [--skip-ci] [--notes FILE]
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { manifestUrl } from "../release-manifest";
import { collectArtefacts } from "./artefacts";
import { checkCi } from "./ci";
import { detachVolumes, makeDmg } from "./dmg";
import { verifyManifest, writeManifest } from "./manifest";
import { assetUrl } from "./paths";
import { arg, fail, log, REPO, run } from "./process";
import { publishRelease } from "./publish";
import { expectedTag, readVersion } from "./versions";

/** Fails unless the updater key is on disk; the build cannot sign without it. */
function requireUpdaterKey(): void {
	const key = join(homedir(), ".tauri", "quarry-updater.key");
	if (!existsSync(key)) {
		fail("missing ~/.tauri/quarry-updater.key; the updater cannot be signed");
	}
}

export async function main(): Promise<number> {
	const version = readVersion();
	const tag = arg("--tag") ?? expectedTag(version);
	if (tag !== expectedTag(version)) {
		fail(`tag ${tag} does not match version ${version} (expected ${expectedTag(version)})`);
	}
	if (!/^quarry-alpha\d+$/.test(tag)) {
		log(
			`warning: ${tag} is not an alpha tag; alphas are the local path, betas and stable go to CI`,
		);
	}

	requireUpdaterKey();

	const sha = run("git", ["rev-parse", "HEAD"]).trim();
	// The build reads the working tree, not the commit, so uncommitted edits to tracked files would
	// ship unversioned. Untracked files are excluded: a report or a scratch note does not enter a build.
	if (process.argv.includes("--allow-dirty") === false) {
		const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"]).trim();
		if (dirty !== "") {
			fail(
				`the working tree has uncommitted changes: the build reads the tree, not the commit\n${dirty.split("\n").slice(0, 5).join("\n")}\ncommit them or pass --allow-dirty`,
			);
		}
	}

	checkCi(sha);

	if (process.argv.includes("--skip-gate")) {
		log("WARNING: skipping local gate (--skip-gate)");
	} else {
		log("running the local gate (bun run gate)");
		try {
			run("bun", ["run", "gate"]);
		} catch (error) {
			fail(`local gate failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		log("local gate green");
	}

	if (!process.argv.includes("--skip-build")) {
		log(`building ${version} (universal, signed)`);
		run(
			"bun",
			["run", "tauri", "build", "--bundles", "app", "--target", "universal-apple-darwin"],
			{
				TAURI_SIGNING_PRIVATE_KEY: join(homedir(), ".tauri", "quarry-updater.key"),
				TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
			},
		);
		makeDmg(version);
		detachVolumes();
	}

	const artefacts = collectArtefacts(version);
	const { signature, dmg } = artefacts;

	// The build takes minutes and reads the tree as it goes: a checkout that moved means the bytes in
	// the bundle are not the bytes of this commit, so the tag would name an artefact nobody can rebuild.
	const headNow = run("git", ["rev-parse", "HEAD"]).trim();
	if (headNow !== sha) {
		fail(
			`the checkout moved during the build (${sha.slice(0, 7)} -> ${headNow.slice(0, 7)}): the artefact does not match ${sha.slice(0, 7)}, rebuild from it`,
		);
	}

	const latest = writeManifest(version, tag, signature, sha);
	const dmgName = dmg.slice(dmg.lastIndexOf("/") + 1);

	publishRelease(tag, version, latest, artefacts);
	await verifyManifest(tag, version);

	detachVolumes();
	log(`published ${tag}`);
	log(`  version    ${version}`);
	log(`  update     ${assetUrl(tag, "quarry.app.tar.gz")}`);
	log(`  dmg        ${assetUrl(tag, dmgName)}`);
	log(`  manifest   ${manifestUrl(REPO, tag)}`);
	return 0;
}
