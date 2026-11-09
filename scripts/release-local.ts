#!/usr/bin/env bun
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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ciVerdict } from "./ci-status";
import {
	isStableTag,
	lockVersion,
	manifestPlatforms,
	manifestProblem,
	manifestUrl,
	type PublishedManifest,
	selectDmg,
	versionDrift,
} from "./release-manifest";
import { uploadAssets } from "./release-publish";

const ROOT = join(import.meta.dir, "..");
const REPO = "JeffreyJYZ/quarry";
/** The release build is universal, so Tauri writes under the target-specific directory. */
const BUILD_TARGET = "universal-apple-darwin";
const BUNDLE = join(ROOT, "src-tauri", "target", BUILD_TARGET, "release", "bundle", "macos");
const ARCHIVE = join(BUNDLE, "quarry.app.tar.gz");
const ARCHIVE_SIG = `${ARCHIVE}.sig`;
const DMG_DIR = join(ROOT, "src-tauri", "target", BUILD_TARGET, "release", "bundle", "dmg");
const RELEASE_DIR = join(ROOT, "dist-release");
const LATEST = join(RELEASE_DIR, "latest.json");

/** Every file `bump-version.ts` writes, so a half-bumped tree is refused before a build. */
function readVersions() {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
	const tauri = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8")) as {
		version: string;
	};
	const site = JSON.parse(readFileSync(join(ROOT, "website", "package.json"), "utf8")) as {
		version: string;
	};
	const cargoRaw = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
	const cargo = /^version\s*=\s*"([^"]+)"/m.exec(cargoRaw)?.[1] ?? "";
	const lock = lockVersion(readFileSync(join(ROOT, "src-tauri", "Cargo.lock"), "utf8"));
	return { package: pkg.version, tauri: tauri.version, cargo, site: site.version, lock };
}

function readVersion(): string {
	const versions = readVersions();
	const drift = versionDrift(versions);
	if (drift !== null) fail(drift);
	return versions.package;
}

/** `quarry-alpha12` for `X.Y.Z-alpha.12`, `vX.Y.Z` for a stable version. */
function expectedTag(version: string): string {
	const alpha = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
	if (alpha !== null) return `quarry-alpha${alpha[2]}`;
	return `v${version}`;
}

function arg(name: string): string | null {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): string {
	return execFileSync(command, args, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, ...env },
	});
}

/**
 * The dmg the bundler wrote: its name carries the bundle target, so it is found rather than guessed.
 * Tauri mounts the image to lay out the volume, which is why the mount is detached afterwards.
 */
function dmgPath(version: string): string | null {
	if (!existsSync(DMG_DIR)) return null;
	const candidates = readdirSync(DMG_DIR);
	const { selected, error } = selectDmg(candidates, version);
	if (error !== null) return null;
	return selected === null ? null : join(DMG_DIR, selected);
}

/**
 * Writes the dmg straight from the built bundle.
 *
 * Tauri's own dmg step asks Finder, through AppleScript, to hide a status bar on the mounted volume;
 * that fails with -10006 whenever Finder is busy, which takes the whole release down. hdiutil copies
 * the folder and converts it, with no Finder and no mount.
 */
function makeDmg(version: string): void {
	const app = join(BUNDLE, "quarry.app");
	if (!existsSync(app)) fail(`missing app bundle: ${app}`);
	execFileSync("mkdir", ["-p", DMG_DIR]);
	// The bundle is universal, so the dmg name says so rather than naming one half of it.
	const arch = "universal";
	const target = join(DMG_DIR, `quarry_${version}_${arch}.dmg`);
	execFileSync(
		"hdiutil",
		["create", "-volname", "quarry", "-srcfolder", app, "-ov", "-format", "UDZO", target],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	log(`dmg ${target}`);
}

/** Detaches every mounted quarry volume, so a stray Finder window never survives a release. */
function detachVolumes(): void {
	const volumes = existsSync("/Volumes") ? readdirSync("/Volumes") : [];
	for (const name of volumes) {
		if (!name.toLowerCase().startsWith("quarry")) continue;
		try {
			execFileSync("hdiutil", ["detach", join("/Volumes", name)], { stdio: "ignore" });
			log(`detached /Volumes/${name}`);
		} catch {
			/* a volume someone is using stays mounted; nothing else to do */
		}
	}
}

function log(line: string): void {
	console.log(`release-local  ${line}`);
}

function fail(message: string): never {
	console.error(`release-local  FAIL  ${message}`);
	process.exit(1);
}

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
function notesFromGit(commit: string): string {
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

/** The public URL a release asset serves once the release is published. */
function assetUrl(tag: string, name: string): string {
	return `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
}

async function main(): Promise<number> {
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

	if (!existsSync(join(homedir(), ".tauri", "quarry-updater.key"))) {
		fail("missing ~/.tauri/quarry-updater.key; the updater cannot be signed");
	}

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
	if (process.argv.includes("--skip-ci")) {
		log(`WARNING: skipping CI check for ${sha} (--skip-ci)`);
	} else {
		const raw = run("gh", [
			"run",
			"list",
			"--workflow",
			"CI",
			"--commit",
			sha,
			"--limit",
			"1",
			"--json",
			"conclusion,status,databaseId,headSha,url",
		]).trim();
		const runs = JSON.parse(raw) as {
			status: string;
			conclusion: string | null;
			url: string;
			databaseId: number;
		}[];
		const ciRun = runs[0] ?? null;
		let failingJobs: string[] = [];
		if (ciRun !== null && ciRun.status === "completed" && ciRun.conclusion !== "success") {
			const viewRaw = run("gh", [
				"run",
				"view",
				String(ciRun.databaseId),
				"--json",
				"jobs",
			]).trim();
			const view = JSON.parse(viewRaw) as {
				jobs: { name: string; conclusion: string | null }[];
			};
			failingJobs = view.jobs
				.filter((job) => job.conclusion !== "success" && job.conclusion !== null)
				.map((job) => job.name);
		}
		const verdict = ciVerdict(sha, ciRun, failingJobs);
		if (!verdict.proceed) {
			if (verdict.failingJobs.length > 0) {
				fail(`${verdict.message} — failing jobs: ${verdict.failingJobs.join(", ")}`);
			}
			fail(verdict.message);
		}
		log(verdict.message);
	}

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

	if (dmgPath(version) === null) {
		if (existsSync(DMG_DIR)) {
			const { error } = selectDmg(readdirSync(DMG_DIR), version);
			if (error !== null) fail(error);
		}
		makeDmg(version);
	}

	const archive = ARCHIVE;
	const signatureFile = ARCHIVE_SIG;
	const dmg = dmgPath(version);
	if (!existsSync(archive)) fail(`missing updater archive: ${archive}`);
	if (!existsSync(signatureFile)) fail(`missing updater signature: ${signatureFile}`);
	if (dmg === null) fail(`missing dmg for ${version} under ${DMG_DIR}`);

	const signature = readFileSync(signatureFile, "utf8").trim();
	if (signature === "") fail("the updater signature is empty");
	// The trusted comment carries the version that was signed. A failed build leaves the previous
	// archive in place, so without this check a release can publish last build's bytes under this
	// version's name, and the updater then reinstalls the old app forever.
	const signed = Buffer.from(signature, "base64").toString("utf8");
	const signedVersion = /version:(\S+)/.exec(signed)?.[1];
	if (signedVersion !== version) {
		fail(
			`the updater archive was signed for ${signedVersion ?? "an unknown version"}, not ${version}: rebuild before publishing`,
		);
	}
	const archiveMtime = statSync(archive).mtimeMs;
	const appMtime = statSync(join(BUNDLE, "quarry.app", "Contents", "MacOS", "quarry")).mtimeMs;
	if (archiveMtime < appMtime) {
		fail("the updater archive is older than the app binary: rebuild before publishing");
	}

	// The build takes minutes and reads the tree as it goes: a checkout that moved means the bytes in
	// the bundle are not the bytes of this commit, so the tag would name an artefact nobody can rebuild.
	const headNow = run("git", ["rev-parse", "HEAD"]).trim();
	if (headNow !== sha) {
		fail(
			`the checkout moved during the build (${sha.slice(0, 7)} -> ${headNow.slice(0, 7)}): the artefact does not match ${sha.slice(0, 7)}, rebuild from it`,
		);
	}

	const entry = {
		signature,
		url: assetUrl(tag, "quarry.app.tar.gz"),
	};
	const latest = {
		version,
		notes: arg("--notes") !== null ? readFileSync(arg("--notes") as string, "utf8") : "",
		pub_date: new Date().toISOString(),
		platforms: Object.fromEntries(manifestPlatforms().map((key) => [key, entry])),
	};
	const latestDir = join(ROOT, "dist-release");
	execFileSync("mkdir", ["-p", latestDir]);
	writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);

	if (arg("--notes") === null) {
		const notes = notesFromGit(sha);
		latest.notes = notes;
		writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);
	}

	const dmgPathValue = dmg as string;
	const assets = [
		{ path: archive, name: "quarry.app.tar.gz" },
		{ path: signatureFile, name: "quarry.app.tar.gz.sig" },
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
		const notesFile = join(latestDir, "notes.md");
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

	// One asset per call, retried, so a failure names the tag and the file instead of leaving a
	// release whose assets are only partly there.
	uploadAssets(run, tag, assets);

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

	detachVolumes();
	log(`published ${tag}`);
	log(`  version    ${version}`);
	log(`  update     ${assetUrl(tag, "quarry.app.tar.gz")}`);
	log(`  dmg        ${assetUrl(tag, dmgPathValue.slice(dmgPathValue.lastIndexOf("/") + 1))}`);
	log(`  manifest   ${url}`);
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
