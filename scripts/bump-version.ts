#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
// Bumps the version in package.json, src-tauri/tauri.conf.json and
// src-tauri/Cargo.toml in lockstep, refreshes Cargo.lock, and prints the
// new version on the last line of stdout. Exit non-zero on any failure.
import { readFileSync, writeFileSync } from "node:fs";

const bump = (process.argv[2] ?? "patch").toLowerCase();
if (!["patch", "minor", "major", "alpha"].includes(bump)) {
	console.error(`unknown bump: ${bump}`);
	process.exit(2);
}

const PKG = "package.json";
const TAURI = "src-tauri/tauri.conf.json";
const CARGO = "src-tauri/Cargo.toml";
// The docs site mirrors the app version so a deployment of `website/` alone still shows it.
const SITE = "website/package.json";

function readVersion(file: string, re: RegExp): string {
	const text = readFileSync(file, "utf8");
	const m = text.match(re);
	if (!m) throw new Error(`version not found in ${file}`);
	return m[1];
}

const pkgV = readVersion(PKG, /"version"\s*:\s*"([^"]+)"/);
const tauriV = readVersion(TAURI, /"version"\s*:\s*"([^"]+)"/);
const cargoV = readVersion(CARGO, /^version\s*=\s*"([^"]+)"/m);
const siteV = readVersion(SITE, /"version"\s*:\s*"([^"]+)"/);

// All three must agree before bumping.
if (pkgV !== tauriV || pkgV !== cargoV || pkgV !== siteV) {
	console.error(
		`version sources disagree: package.json=${pkgV} tauri.conf.json=${tauriV} Cargo.toml=${cargoV} website=${siteV}`,
	);
	process.exit(1);
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const parsed = VERSION_RE.exec(pkgV);
if (parsed === null) {
	console.error(`invalid semver: ${pkgV}`);
	process.exit(1);
}
const major = Number(parsed[1]);
const minor = Number(parsed[2]);
const patch = Number(parsed[3]);
const pre = parsed[4] ?? null;

let version: string;
if (bump === "alpha") {
	// `quarry-alphaN` tags carry `X.Y.Z-alpha.N`; the counter advances, the core does not.
	const counter = pre === null ? null : /^alpha\.(\d+)$/.exec(pre);
	const next = counter === null ? 1 : Number(counter[1]) + 1;
	version = `${major}.${minor}.${patch}-alpha.${next}`;
} else if (bump === "major") {
	version = `${major + 1}.0.0`;
} else if (bump === "minor") {
	version = `${major}.${minor + 1}.0`;
} else {
	version = `${major}.${minor}.${patch + 1}`;
}

// package.json & tauri.conf.json: "version": "X"
for (const f of [PKG, TAURI, SITE]) {
	const re = /"version"\s*:\s*"[^"]*"/;
	const text = readFileSync(f, "utf8");
	if (!re.test(text)) throw new Error(`version field missing in ${f}`);
	writeFileSync(f, text.replace(re, `"version": "${version}"`));
}

// Cargo.toml: version = "X" (first occurrence, the package version)
{
	const re = /^version\s*=\s*"[^"]*"/m;
	const text = readFileSync(CARGO, "utf8");
	if (!re.test(text)) throw new Error(`version field missing in ${CARGO}`);
	writeFileSync(CARGO, text.replace(re, `version = "${version}"`));
}

// Refresh Cargo.lock for the workspace crate.
const r = spawnSync("cargo", ["update", "-p", "quarry"], { cwd: "src-tauri", stdio: "inherit" });
if (r.status !== 0) {
	console.error("cargo update failed");
	process.exit(r.status ?? 1);
}

// Verify all three agree after bump.
const afterPkg = readVersion(PKG, /"version"\s*:\s*"([^"]+)"/);
const afterTauri = readVersion(TAURI, /"version"\s*:\s*"([^"]+)"/);
const afterCargo = readVersion(CARGO, /^version\s*=\s*"([^"]+)"/m);
const afterSite = readVersion(SITE, /"version"\s*:\s*"([^"]+)"/);
if (
	afterPkg !== version ||
	afterTauri !== version ||
	afterCargo !== version ||
	afterSite !== version
) {
	console.error(
		`post-bump version mismatch: package.json=${afterPkg} tauri.conf.json=${afterTauri} Cargo.toml=${afterCargo} website=${afterSite} expected=${version}`,
	);
	process.exit(1);
}
if (afterPkg !== afterTauri || afterPkg !== afterCargo || afterPkg !== afterSite) {
	console.error("version sources disagree after bump");
	process.exit(1);
}

console.log(version);
