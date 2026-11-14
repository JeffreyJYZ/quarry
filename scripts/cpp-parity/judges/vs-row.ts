#!/usr/bin/env bun
/**
 * The `generator: Visual Studio` parity row, judged end to end.
 *
 * The row runs the plan's own configure and build and starts clangd with the product's own
 * arguments, so it does not re-implement a decision. What it adds is the Windows evidence: that the
 * generator writes no database and the one quarry synthesises is usable, that the configuration
 * reaches `--config` instead of `CMAKE_BUILD_TYPE`, that the artefact the plan names is the file
 * that build wrote, and that the command line inside the database is MSVC's.
 */

import { basename, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import { VS_BUILD_DIR, VS_HALVES } from "../fixtures/windows";
import type { Row, Verdict } from "../types";
import { errorLines, type WindowsHarness } from "../windows";
import { judgeHalf } from "./vs-half";
import { blankRow, fixtureBuild, toolsetGuard, worst } from "./windows-common";

/**
 * The generator row: no database from Visual Studio, one synthesised from the file API, both
 * configurations reaching `--config`, and the artefact the plan names being the one that build wrote.
 */
export async function judgeVisualStudio(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	const generator = fixture.generator ?? "the Visual Studio generator";
	harness.writeFixture();
	const row = blankRow(fixture.name);
	const findings: string[] = [];
	let broken = false;

	const own = await fixtureBuild(fixture, root, harness, row);
	if (!own.ok) {
		// The whole stderr, line by line: CMake wraps this message over four lines, and the first two
		// were all the row used to keep — which cut the cause off after the word "Generator".
		const lines = errorLines(own.stderr);
		row.details.push(
			`fixture FAIL  the fixture's own build failed (${lines.length} line(s) of stderr)`,
		);
		for (const line of lines) row.details.push(`stderr       ${line}`);
		const skipped = toolsetGuard(own.stderr, fixture.name, findings);
		if (skipped !== null) return skipped;
		broken = true;
		return { row, findings, broken };
	}

	// The premise: this generator writes no database. If it did, the row would be measuring a file
	// CMake wrote rather than one quarry synthesised, so that is a probe defect, not a verdict.
	if (harness.isFile(join(root, VS_BUILD_DIR, "compile_commands.json"))) {
		broken = true;
		row.details.push(
			`fixture FAIL  ${generator} wrote a compile_commands.json, so this row cannot measure the synthesis`,
		);
		return { row, findings, broken };
	}
	row.details.push(`generator    PASS  ${generator} wrote no compile_commands.json`);

	let passed = true;
	let named = true;
	let analysed: Verdict = "n/a";
	for (const half of VS_HALVES) {
		const judged = await judgeHalf(fixture, root, harness, row, half, findings);
		if (judged.broken) {
			broken = true;
			break;
		}
		passed = passed && judged.ok;
		named = named && judged.named;
		analysed = worst(analysed, judged.analysis);
		if (judged.plan === null) break;
	}

	if (harness.isFile(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	row.build = passed ? "PASS" : "FAIL";
	row.targets = named ? "PASS" : "FAIL";
	row.analysis = analysed;
	return { row, findings, broken };
}
