/**
 * The test-runner row's two platform modes, each printing the same PASS/FAIL lines over the same
 * assertions: Windows builds a Visual Studio tree, Linux a single-config one.
 *
 * A mode that cannot be measured on this machine prints one SKIP line naming the gap and exits 0,
 * so a missing generator or toolchain never reads as a passing row.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargoRow } from "./cargo-row";
import { gtestRow } from "./gtest-row";
import { detectSingleConfig, windowsProfile } from "./platform";
import type { Harness, Row } from "./row";
import { conclusion, printRow, productBinary } from "./run";
import { detectGenerator, versionLine } from "./tools";

/** Why a machine without Windows cannot measure that row, in words that name the gap. */
const NO_WINDOWS = `this machine is ${process.platform}: the row needs Windows, where a Visual Studio generator writes the <Config>\\<name>.exe the dock lists and runs, and where the Cargo project builds with MSVC; run it on windows-latest`;

/** Why Windows cannot measure the Linux row: the tree and the artefact name are the measurement. */
const NO_LINUX_ON_WINDOWS = `this machine is win32: the Linux row measures a single-config tree whose artefact is build/<target> with no .exe, and a Windows CMake writes a multi-config tree this row cannot read; run it on ubuntu-latest`;

/**
 * What this machine is, and which half of the row it proves.
 *
 * The assertions are the dock's, so they are measured wherever a single-config tree exists; what
 * only `ubuntu-latest` proves is that the Linux toolchain — GCC, ELF, no `.exe` — is what those
 * assertions were made against. On another POSIX machine the row says so rather than passing
 * quietly as if it had run on Linux.
 */
function platformLine(): string {
	const where = `${process.platform} ${process.arch}`;
	if (process.platform === "linux") {
		return `${where}: single-config tree, ELF artefacts, no .exe`;
	}
	return `${where}: the same single-config tree is built here; the Linux/ELF verdict is ubuntu-latest's`;
}

/** The rows, printed, with the exit code their findings decide. */
async function measure(harness: Harness): Promise<number> {
	const rows: Row[] = [await gtestRow(harness), await cargoRow(harness)];
	for (const row of rows) printRow(row);
	return conclusion(rows);
}

/** Windows: a Visual Studio generator, `--config Debug`, and `<Config>\<target>.exe`. */
async function windowsRun(): Promise<number> {
	if (process.platform !== "win32") {
		console.log(`SKIP  windows test-runner (${NO_WINDOWS})`);
		return 0;
	}
	const scratch = mkdtempSync(join(tmpdir(), "quarry-windows-tests-"));
	console.log("windows test-runner");
	console.log(`  scratch     ${scratch}`);
	for (const tool of ["cmake", "cargo", "rustc"]) {
		console.log(`  ${tool.padEnd(12)}${await versionLine(tool, scratch)}`);
	}

	const search = await detectGenerator("cmake", scratch);
	for (const attempt of search.attempts) console.log(`  generator   ${attempt}`);
	if (search.generator === null) {
		console.log(
			"SKIP  windows test-runner (no Visual Studio generator can configure: the C++ toolset is not installed)",
		);
		return 0;
	}
	const profile = windowsProfile(search.generator);
	console.log(`  layout      ${profile.facts}`);
	const tests = await productBinary();
	console.log(`  product     ${tests}`);
	return measure({ tests, scratch, profile, cmake: "cmake" });
}

/** Linux: the first single-config generator that configures, and `build/<target>` with no suffix. */
async function linuxRun(): Promise<number> {
	if (process.platform === "win32") {
		console.log(`SKIP  linux test-runner (${NO_LINUX_ON_WINDOWS})`);
		return 0;
	}
	const scratch = mkdtempSync(join(tmpdir(), "quarry-linux-tests-"));
	console.log("linux test-runner");
	console.log(`  platform    ${platformLine()}`);
	console.log(`  scratch     ${scratch}`);
	for (const tool of ["cmake", "cargo", "rustc"]) {
		const line = await versionLine(tool, scratch);
		console.log(`  ${tool.padEnd(12)}${line}`);
		if (line.startsWith("missing")) {
			console.log(
				`SKIP  linux test-runner (${tool} is not installed, so no fixture can be built)`,
			);
			return 0;
		}
	}

	const search = await detectSingleConfig("cmake", scratch);
	for (const attempt of search.attempts) console.log(`  generator   ${attempt}`);
	if (search.profile === null) {
		console.log(
			"SKIP  linux test-runner (no single-config generator can configure a C++ project: no C++ toolchain is installed)",
		);
		return 0;
	}
	console.log(`  layout      ${search.profile.facts}`);
	const tests = await productBinary();
	console.log(`  product     ${tests}`);
	return measure({ tests, scratch, profile: search.profile, cmake: "cmake" });
}

/** `--linux` selects the single-config row; the default is the Windows row, `--windows` says so. */
export async function main(): Promise<number> {
	const linux = process.argv.includes("--linux");
	const windows = process.argv.includes("--windows");
	if (linux && windows) {
		console.log("usage: bun scripts/parity-windows-tests.ts [--windows|--linux]");
		return 2;
	}
	return linux ? linuxRun() : windowsRun();
}
