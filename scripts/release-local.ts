#!/usr/bin/env bun
/**
 * Fast release: build on this Mac and publish macOS artefacts directly.
 *
 * CI builds every platform and takes ten minutes or more; an alpha does not need that. This script
 * builds the signed bundle here, writes `latest.json` for the updater, publishes the release and then
 * proves the public URL serves the version it just published. Full multi-platform builds stay on CI
 * for `quarry-beta*` and `v*` tags.
 *
 * Usage: bun scripts/release-local.ts [--tag quarry-alphaN] [--skip-build] [--notes FILE]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const REPO = "JeffreyJYZ/quarry";
const BUNDLE = join(ROOT, "src-tauri", "target", "release", "bundle", "macos");
const ARCHIVE = join(BUNDLE, "quarry.app.tar.gz");
const ARCHIVE_SIG = `${ARCHIVE}.sig`;
const DMG = join(BUNDLE, "quarry_0.0.0_universal.dmg");
const LATEST = join(ROOT, "dist-release", "latest.json");

function readVersion(): string {
	const raw = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
	return raw.version;
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

function dmgPath(version: string): string {
	return join(BUNDLE, `quarry_${version}_universal.dmg`);
}

function log(line: string): void {
	console.log(`release-local  ${line}`);
}

function fail(message: string): never {
	console.error(`release-local  FAIL  ${message}`);
	process.exit(1);
}

function notesFromGit(tag: string): string {
	try {
		const previous = run("git", ["describe", "--tags", "--abbrev=0", `${tag}^`]).trim();
		return run("git", ["log", "--no-merges", "--pretty=format:- %s", `${previous}..${tag}`]);
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

	if (!process.argv.includes("--skip-build")) {
		log(`building ${version} (universal, signed)`);
		run("bun", ["run", "tauri", "build", "--bundles", "app,dmg"], {
			TAURI_SIGNING_PRIVATE_KEY: join(homedir(), ".tauri", "quarry-updater.key"),
			TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
		});
	}

	const archive = ARCHIVE;
	const signatureFile = ARCHIVE_SIG;
	const dmg = dmgPath(version);
	if (!existsSync(archive)) fail(`missing updater archive: ${archive}`);
	if (!existsSync(signatureFile)) fail(`missing updater signature: ${signatureFile}`);
	if (!existsSync(dmg)) fail(`missing dmg: ${dmg}`);

	const signature = readFileSync(signatureFile, "utf8").trim();
	if (signature === "") fail("the updater signature is empty");

	const entry = {
		signature,
		url: assetUrl(tag, "quarry.app.tar.gz"),
	};
	const latest = {
		version,
		notes: arg("--notes") !== null ? readFileSync(arg("--notes") as string, "utf8") : "",
		pub_date: new Date().toISOString(),
		platforms: {
			"darwin-aarch64": entry,
			"darwin-x86_64": entry,
			"darwin-aarch64-app": entry,
			"darwin-x86_64-app": entry,
		},
	};
	const latestDir = join(ROOT, "dist-release");
	execFileSync("mkdir", ["-p", latestDir]);
	writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);

	if (arg("--notes") === null) {
		const notes = notesFromGit(tag);
		latest.notes = notes;
		writeFileSync(LATEST, `${JSON.stringify(latest, null, 2)}\n`);
	}

	const assets = [
		[archive, "quarry.app.tar.gz"],
		[signatureFile, "quarry.app.tar.gz.sig"],
		[dmg, `quarry_${version}_universal.dmg`],
		[LATEST, "latest.json"],
	] as const;

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
		const upload = assets.map(([path, name]) => [`${path}#${name}`]).flat();
		run("gh", ["release", "upload", tag, ...upload, "--clobber"]);
		run("gh", ["release", "edit", tag, "--notes", latest.notes]);
	} else {
		log(`creating release ${tag}`);
		const notesFile = join(latestDir, "notes.md");
		writeFileSync(notesFile, latest.notes);
		const upload = assets.map(([path, name]) => [`${path}#${name}`]).flat();
		run("gh", [
			"release",
			"create",
			tag,
			...upload,
			"--title",
			`quarry ${version}`,
			"--notes-file",
			notesFile,
			"--latest",
		]);
	}

	log("verifying the published manifest");
	let published: {
		version?: string;
		platforms?: Record<string, { signature?: string; url?: string }>;
	} = {};
	let lastError = "";
	for (let attempt = 0; attempt < 10; attempt += 1) {
		try {
			const response = await fetch(
				`https://github.com/${REPO}/releases/latest/download/latest.json`,
				{ redirect: "follow" },
			);
			if (response.ok) {
				published = (await response.json()) as typeof published;
				break;
			}
			lastError = `HTTP ${response.status}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}

	if (published.version !== version) {
		fail(
			`latest.json reports ${published.version ?? "nothing"} (${lastError}), expected ${version}`,
		);
	}
	for (const platform of ["darwin-aarch64", "darwin-x86_64"]) {
		const row = published.platforms?.[platform];
		if (row === undefined || row.signature === undefined || row.url === undefined) {
			fail(`latest.json has no usable ${platform} entry`);
		}
	}

	log(`published ${tag}`);
	log(`  version    ${version}`);
	log(`  update     ${assetUrl(tag, "quarry.app.tar.gz")}`);
	log(`  dmg        ${assetUrl(tag, `quarry_${version}_universal.dmg`)}`);
	log(`  manifest   https://github.com/${REPO}/releases/latest/download/latest.json`);
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
