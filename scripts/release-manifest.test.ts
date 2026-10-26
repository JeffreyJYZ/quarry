import { describe, expect, test } from "bun:test";
import { isStableTag, manifestPlatforms, selectDmg, versionDrift } from "./release-manifest";

describe("versionDrift", () => {
	test("agrees", () => {
		expect(versionDrift({ package: "1.0.0", tauri: "1.0.0", cargo: "1.0.0" })).toBeNull();
	});
	test("drift names values", () => {
		expect(versionDrift({ package: "1.0.0", tauri: "1.0.1", cargo: "1.0.0" })).toBe(
			"versions disagree: package.json=1.0.0, src-tauri/tauri.conf.json=1.0.1, src-tauri/Cargo.toml=1.0.0",
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
