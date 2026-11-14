/**
 * A multi-config tree built twice: the configuration reaches the compiler, the run target follows
 * the configuration asked for, and analysis reads that configuration's own compile command.
 *
 * Three things are measured, and all three were wrong for a tree that takes `--config` at build
 * time. The plan used to force `-DCMAKE_BUILD_TYPE` on a tree whose generator ignores it, which is
 * the one flag a multi-config configure must never carry. The run target was resolved for `Debug`
 * whatever the profile, so it named the Debug artefact of a Release build — a path nothing wrote.
 * And the synthesised database held one entry per source per configuration, of which clangd reads
 * the first, so `Release` was analysed with Debug's defines.
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import { MULTI_CONFIG_LEVELS } from "../fixtures/multi-config";
import { firstError } from "../format";
import { run } from "../process";
import { writeFixture, writeQuery } from "../project";
import type { Row } from "../types";
import { judgeConfigHalf } from "./multi-config-half";
import { type ConfigHalf, judgeMultiConfigDebugInfo } from "./multi-config-debug";

export async function judgeMultiConfig(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	writeQuery(root, "build");
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "n/a",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;
	let passed = true;
	let named = true;
	let analysed = true;
	let buildRoot: string | null = null;

	for (const args of fixture.userBuild ?? []) {
		const result = await run(cmake, args, root);
		row.commands.push({
			line: `cd ${directory} && cmake ${args.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) {
			broken = true;
			row.details.push(`fixture FAIL  cmake ${args.join(" ")}: ${firstError(result.stderr)}`);
		}
	}
	if (broken) return { row, findings, broken };

	const halves: ConfigHalf[] = [
		{
			profile: "release",
			configuration: "Release",
			debugInfo: false,
			level: MULTI_CONFIG_LEVELS.Release as number,
		},
		{
			profile: "relwithdebinfo",
			configuration: "RelWithDebInfo",
			debugInfo: true,
			level: MULTI_CONFIG_LEVELS.RelWithDebInfo as number,
		},
	];
	for (const half of halves) {
		const judged = await judgeConfigHalf(root, plannerBin, cmake, clangd, row, findings, half);
		if (judged.buildRoot !== null) buildRoot = judged.buildRoot;
		passed = passed && judged.passed;
		named = named && judged.named;
		analysed = analysed && judged.analysed;
		if (judged.broke) {
			broken = true;
			break;
		}
	}

	// Debug info, from the object each configuration compiled: the tool, not the flags.
	if (buildRoot !== null && !broken) {
		const info = await judgeMultiConfigDebugInfo(buildRoot, halves, root, row, findings);
		passed = passed && info.passed;
		broken = broken || info.broken;
	}

	if (existsSync(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	row.build = passed ? "PASS" : "FAIL";
	row.analysis = analysed ? "PASS" : "FAIL";
	row.targets = named ? "PASS" : "FAIL";
	return { row, findings, broken };
}
