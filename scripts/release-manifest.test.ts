import { describe, expect, test } from "bun:test";
import {
	isStableTag,
	lockVersion,
	manifestPlatforms,
	manifestProblem,
	manifestUrl,
	selectDmg,
	versionDrift,
} from "./release-manifest";

const VERSION = "1.0.0";

describe("versionDrift", () => {
	test("agrees across all five files", () => {
		expect(
			versionDrift({
				package: VERSION,
				tauri: VERSION,
				cargo: VERSION,
				site: VERSION,
				lock: VERSION,
			}),
		).toBeNull();
	});
	test("drift names values", () => {
		expect(
			versionDrift({
				package: VERSION,
				tauri: "1.0.1",
				cargo: VERSION,
				site: VERSION,
				lock: VERSION,
			}),
		).toBe(
			"versions disagree: package.json=1.0.0, src-tauri/tauri.conf.json=1.0.1, src-tauri/Cargo.toml=1.0.0, website/package.json=1.0.0, src-tauri/Cargo.lock=1.0.0",
		);
	});
	test("website drift is refused", () => {
		expect(
			versionDrift({
				package: VERSION,
				tauri: VERSION,
				cargo: VERSION,
				site: "0.9.0",
				lock: VERSION,
			}),
		).toContain("website/package.json=0.9.0");
	});
	test("Cargo.lock drift is refused", () => {
		expect(
			versionDrift({
				package: VERSION,
				tauri: VERSION,
				cargo: VERSION,
				site: VERSION,
				lock: "0.9.0",
			}),
		).toContain("src-tauri/Cargo.lock=0.9.0");
	});
});

describe("lockVersion", () => {
	const lock = [
		"version = 4",
		"",
		"[[package]]",
		'name = "quarry"',
		`version = "${VERSION}"`,
		"dependencies = [",
		' "libc",',
		"]",
		"",
		"[[package]]",
		'name = "quarry-lsp"',
		'version = "9.9.9"',
	].join("\n");

	test("reads the quarry entry", () => {
		expect(lockVersion(lock)).toBe(VERSION);
	});
	test("missing entry is empty", () => {
		expect(lockVersion('[[package]]\nname = "other"\nversion = "1.0.0"')).toBe("");
	});
	test("a similarly named crate is not the quarry entry", () => {
		expect(lockVersion('[[package]]\nname = "quarry-lsp"\nversion = "9.9.9"')).toBe("");
	});
});

describe("manifestUrl", () => {
	const repo = "JeffreyJYZ/quarry";
	test("a prerelease is read from its own tag", () => {
		expect(manifestUrl(repo, "quarry-alpha9")).toBe(
			"https://github.com/JeffreyJYZ/quarry/releases/download/quarry-alpha9/latest.json",
		);
	});
	test("a stable release owns the latest alias", () => {
		expect(manifestUrl(repo, "v1.2.3")).toBe(
			"https://github.com/JeffreyJYZ/quarry/releases/latest/download/latest.json",
		);
	});
});

describe("manifestProblem", () => {
	const platforms = manifestPlatforms();
	const whole = {
		version: VERSION,
		platforms: Object.fromEntries(
			platforms.map((key) => [key, { signature: "sig", url: "https://example.com/app" }]),
		),
	};

	test("a whole manifest passes", () => {
		expect(manifestProblem(whole, VERSION, platforms)).toBeNull();
	});
	test("a stale version is named", () => {
		expect(manifestProblem({ ...whole, version: "0.9.0" }, VERSION, platforms)).toBe(
			"the published manifest reports 0.9.0, expected 1.0.0",
		);
	});
	test("a missing manifest fails", () => {
		expect(manifestProblem({}, VERSION, platforms)).toBe(
			"the published manifest reports no version, expected 1.0.0",
		);
	});
	test("a missing platform entry fails", () => {
		const broken = {
			...whole,
			platforms: { ...whole.platforms, "darwin-x86_64": { signature: "sig" } },
		};
		expect(manifestProblem(broken, VERSION, platforms)).toBe(
			"the published latest.json has no usable darwin-x86_64 entry",
		);
	});
});

describe("selectDmg", () => {
	test("single match", () => {
		const r = selectDmg(["quarry_1.0.0_aarch64.dmg", "other.txt"], "1.0.0");
		expect(r.selected).toBe("quarry_1.0.0_aarch64.dmg");
		expect(r.error).toBeNull();
	});
	test("zero matches", () => {
		const r = selectDmg(["quarry_0.9.0_aarch64.dmg"], "1.0.0");
		expect(r.selected).toBeNull();
		expect(r.error).toContain("found 0");
	});
	test("multiple matches", () => {
		const r = selectDmg(["quarry_1.0.0_aarch64.dmg", "quarry_1.0.0_x86_64.dmg"], "1.0.0");
		expect(r.selected).toBeNull();
		expect(r.error).toContain("found 2");
	});
	test("stale name ignored", () => {
		const r = selectDmg(["quarry_1.0.0_aarch64.dmg", "quarry_0.9.0_aarch64.dmg"], "1.0.0");
		expect(r.selected).toBe("quarry_1.0.0_aarch64.dmg");
	});
});

describe("manifestPlatforms", () => {
	test("rows", () => {
		expect(manifestPlatforms()).toEqual([
			"darwin-aarch64",
			"darwin-x86_64",
			"darwin-aarch64-app",
			"darwin-x86_64-app",
		]);
	});
});

describe("isStableTag", () => {
	test("stable", () => expect(isStableTag("v1.2.3")).toBe(true));
	test("alpha", () => expect(isStableTag("quarry-alpha3")).toBe(false));
});
