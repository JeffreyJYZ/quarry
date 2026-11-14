/**
 * The path identity the generator row judges an artefact by, measured without a Windows machine.
 *
 * A Windows runner spelled one file two ways — the fixture root as a short (8.3) path, CMake's
 * reply as the long form — and the row failed a file that existed. These are the cases that must
 * hold instead: one file under two spellings matches, and two configurations' artefacts never do.
 */

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { samePath } from "./windows-common";

test.skipIf(process.platform === "win32")(
	"one file under two spellings matches, as a short path and its long form do",
	() => {
		const root = mkdtempSync(join(tmpdir(), "quarry-same-path-"));
		const alias = `${root}-alias`;
		symlinkSync(root, alias);
		mkdirSync(join(root, "build", "Debug"), { recursive: true });
		const built = join(root, "build", "Debug", "parity_vs.exe");
		writeFileSync(built, "");
		const spelled = join(alias, "build", "Debug", "parity_vs.exe");
		expect(spelled).not.toBe(built);
		expect(samePath(spelled, built)).toBe(true);
	},
);

test("two configurations' artefacts do not match, even though both exist", () => {
	const root = mkdtempSync(join(tmpdir(), "quarry-same-path-"));
	mkdirSync(join(root, "build", "Debug"), { recursive: true });
	mkdirSync(join(root, "build", "Release"), { recursive: true });
	writeFileSync(join(root, "build", "Debug", "parity_vs.exe"), "");
	writeFileSync(join(root, "build", "Release", "parity_vs.exe"), "");
	expect(
		samePath(
			join(root, "build", "Debug", "parity_vs.exe"),
			join(root, "build", "Release", "parity_vs.exe"),
		),
	).toBe(false);
});

test("an artefact that is not built yet is compared as spelled", () => {
	const root = join(tmpdir(), "quarry-same-path-absent");
	const debug = join(root, "build", "Debug", "parity_vs.exe");
	expect(samePath(debug, join(root, "build", "Release", "parity_vs.exe"))).toBe(false);
	expect(samePath(debug, debug)).toBe(true);
});

test("a separator is not a spelling difference", () => {
	const windows = join(tmpdir(), "quarry-same-path-absent", "build", "Debug", "parity_vs.exe");
	expect(samePath(windows.replaceAll("/", "\\"), windows)).toBe(true);
});
