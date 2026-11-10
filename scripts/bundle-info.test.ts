import { describe, expect, test } from "bun:test";
import {
	bundleDir,
	DEFAULT_TARGET,
	isUniversalBinary,
	lipoProblem,
	releaseDir,
} from "./bundle-info";

const ROOT = "/repo";

describe("bundle paths", () => {
	test("a release is universal by default", () => {
		expect(DEFAULT_TARGET).toBe("universal-apple-darwin");
	});
	test("the bundle lives under the target directory", () => {
		expect(bundleDir(ROOT, DEFAULT_TARGET)).toBe(
			"/repo/src-tauri/target/universal-apple-darwin/release/bundle/macos",
		);
	});
	test("the loose binary shares the target directory", () => {
		expect(releaseDir(ROOT, "aarch64-apple-darwin")).toBe(
			"/repo/src-tauri/target/aarch64-apple-darwin/release",
		);
	});
});

describe("lipo", () => {
	test("a fat file with both halves is universal", () => {
		const info = "Architectures in the fat file: /repo/quarry are: x86_64 arm64";
		expect(isUniversalBinary(info)).toBe(true);
		expect(lipoProblem(info)).toBeNull();
	});
	test("a thin arch-only file is refused", () => {
		const info = "Non-fat file: /repo/quarry is architecture: arm64";
		expect(isUniversalBinary(info)).toBe(false);
		expect(lipoProblem(info)).toBe(`the binary is not universal: ${info}`);
	});
	test("an unreadable binary is refused", () => {
		expect(lipoProblem(null)).toBe("lipo could not read the binary");
	});
});
