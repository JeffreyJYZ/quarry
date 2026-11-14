/**
 * Writes the two projects the Windows test-runner row builds.
 *
 * The GoogleTest shim's text and its reasons live in `sources.ts`; nothing here decides a verdict.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
	CARGO_LIB,
	CARGO_MANIFEST,
	CARGO_TEST_FILE,
	GTEST_CMAKE,
	GTEST_HANG,
	GTEST_SHIM,
	GTEST_TEST,
} from "./sources";

export * from "./constants";

function writeFiles(root: string, files: Record<string, string>): void {
	for (const [path, text] of Object.entries(files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
}

/** The CMake project: a GoogleTest-shaped suite plus a program that never answers. */
export function writeGtestProject(root: string): void {
	writeFiles(root, {
		"CMakeLists.txt": GTEST_CMAKE,
		"gtest/gtest.h": GTEST_SHIM,
		"tests/parity_test.cpp": GTEST_TEST,
		"tests/hang.cpp": GTEST_HANG,
	});
}

/** The Cargo project: one integration test, so `--list --format terse` names it. */
export function writeCargoProject(root: string): void {
	writeFiles(root, {
		"Cargo.toml": CARGO_MANIFEST,
		"src/lib.rs": CARGO_LIB,
		"tests/parity.rs": CARGO_TEST_FILE,
	});
}

/** `.quarry/launch.json` naming one program, which is where the dock's gtest list comes from. */
export function writeLaunch(root: string, program: string): void {
	mkdirSync(join(root, ".quarry"), { recursive: true });
	const file = { configurations: [{ name: "parity-tests", program }] };
	writeFileSync(join(root, ".quarry", "launch.json"), `${JSON.stringify(file, null, "\t")}\n`);
}

/** The first file named `name` under `root`: the configuration directory is the generator's. */
export function findExecutable(root: string, name: string, depth = 0): string | null {
	if (depth > 4) return null;
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(path);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			const found = findExecutable(path, name, depth + 1);
			if (found !== null) return found;
		} else if (entry === name) {
			return path;
		}
	}
	return null;
}

/** A fixture path as the launch file spells it: relative to the project root, forward slashes. */
export function relativeProgram(root: string, program: string): string {
	return relative(root, program).split("\\").join("/");
}
