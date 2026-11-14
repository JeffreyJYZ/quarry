#!/usr/bin/env bun
/**
 * The Windows test-runner row: what the test dock must do on the platform CLion's Windows users
 * build on.
 *
 * CLion's parity here is two things a user sees: the test tree is populated from the project's own
 * runner, and a case can be executed from the gutter. quarry's dock does that for a Cargo project by
 * building the test targets with `cargo test --no-run --message-format=json` and asking each built
 * executable for `--list --format terse`, and for a C/C++ project whose `.quarry/launch.json` names
 * a program with `<program> --gtest_list_tests` plus `<program> --gtest_filter=Suite.Case`. This row
 * builds both projects on `windows-latest`, asks the product through `examples/quarry-tests.rs` — so
 * the parse, argv and exit handling judged are quarry's, not this script's — and prints PASS/FAIL
 * per capability.
 *
 * Windows-specific facts the row pins down: the gtest program is the `<Config>/<name>.exe` the
 * Visual Studio generator writes, `--config Debug` is what puts it there, and the image ships no
 * gtest package, so the fixture vendors a GoogleTest-shaped runner (`scripts/windows-tests/
 * fixtures.ts` explains why that measures the dock and not GoogleTest).
 *
 * A row that cannot run says so by name. On a machine that is not Windows this prints one SKIP line
 * with the reason and exits 0; a missing Visual Studio generator or C++ toolset is a SKIP too. A
 * fixture or seam defect exits 2, a product finding exits 1, and every failure quotes the exact
 * command with its exit code and first stderr lines.
 *
 * Usage: bun scripts/parity-windows-tests.ts
 */

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type { Harness, Row } from "./windows-tests/row";
import { cargoRow } from "./windows-tests/cargo-row";
import { gtestRow } from "./windows-tests/gtest-row";
import { detectGenerator, firstError, run, versionLine } from "./windows-tests/tools";

const MANIFEST = join(import.meta.dir, "..", "src-tauri");

/** Why a machine without Windows cannot measure this row, in words that name the gap. */
const NO_WINDOWS = `this machine is ${process.platform}: the row needs Windows, where a Visual Studio generator writes the <Config>\\<name>.exe the dock lists and runs, and where the Cargo project builds with MSVC; run it on windows-latest`;

/** The `quarry-tests` binary, built here unless a caller already built it. */
async function productBinary(): Promise<string> {
	const override = process.env.QUARRY_TESTS_BIN;
	if (override !== undefined && override !== "") {
		const resolved = resolvePath(override);
		if (!existsSync(resolved)) throw new Error(`QUARRY_TESTS_BIN is not a file: ${resolved}`);
		return resolved;
	}
	const result = await run(
		"cargo",
		["build", "--example", "quarry-tests", "--message-format=json"],
		MANIFEST,
		900_000,
	);
	for (const line of result.stdout.split(/\r?\n/)) {
		if (!line.trim().startsWith("{")) continue;
		try {
			const message = JSON.parse(line);
			if (message.reason === "compiler-artifact" && message.target?.name === "quarry-tests") {
				if (typeof message.executable === "string" && existsSync(message.executable)) {
					return message.executable;
				}
			}
		} catch {
			// cargo prints non-JSON lines too; the artifact line is the one this needs.
		}
	}
	throw new Error(
		`cargo build --example quarry-tests exited ${result.code}: ${firstError(result.stderr)}`,
	);
}

/** One row as the report shows it, with the command that failed. */
function printRow(row: Row): void {
	console.log(`  ${row.verdict}  ${row.capability}`);
	for (const detail of row.details) console.log(`            ${detail}`);
	for (const command of row.commands) {
		if (command.verdict === "PASS") continue;
		console.log(`      !     ${command.line}`);
		if (command.detail !== "") console.log(`            ${command.detail}`);
	}
}

async function main(): Promise<number> {
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

	const tests = await productBinary();
	console.log(`  product     ${tests}`);

	const harness: Harness = {
		tests,
		scratch,
		generator: search.generator,
		cmake: "cmake",
	};
	const rows = [await gtestRow(harness), await cargoRow(harness)];
	for (const row of rows) printRow(row);

	const findings = rows.flatMap((row) => row.findings);
	if (findings.length > 0) {
		console.log("");
		console.log("findings");
		for (const finding of findings) console.log(`  - ${finding}`);
	}
	const failed = rows.filter((row) => row.verdict !== "PASS").length;
	if (rows.some((row) => row.broken)) return 2;
	return failed === 0 ? 0 : 1;
}

try {
	process.exit(await main());
} catch (error) {
	console.log(
		`FAIL  windows test-runner (probe defect: ${error instanceof Error ? error.message : String(error)})`,
	);
	process.exit(2);
}
