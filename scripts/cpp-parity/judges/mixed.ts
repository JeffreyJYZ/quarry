/**
 * A mixed C/C++ plain project: each translation unit compiled as its own language, one link.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { analyse, positionOf } from "../analysis";
import { plainCommands, runPlainBuild } from "../build";
import { compileArguments } from "../database";
import { commandLine, describe, describeArguments, firstError } from "../format";
import type { Fixture } from "../fixtures/types";
import { relativeTo } from "../paths";
import { askPlan } from "../plan";
import { run } from "../process";
import { writeFixture } from "../project";
import type { Row } from "../types";

/**
 * Four consumers, because the defect this row exists for has four faces. The plan's database is
 * where a per-language command is recorded — a `.c` entry carrying a C++ driver or `-std=c++20` is
 * a C file compiled as C++, which breaks C the moment it uses something C-only. The build must
 * actually run those commands, the artefact must print the value the C function returned across the
 * `extern "C"` boundary, and clangd must answer in both translation units with no diagnostics —
 * a hover that answers while the file holds a "not allowed with C" error was never analysed as C.
 */
export async function judgeMixedLanguages(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	_cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "FAIL",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	// The fixture's own proof: each unit compiled by its own driver, linked, and run.
	for (const argv of fixture.plainBuild ?? []) {
		const result = await run(argv[0], argv.slice(1), root);
		row.commands.push({
			line: `cd ${directory} && ${argv.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) {
			broken = true;
			row.details.push(`fixture FAIL  ${argv.join(" ")}: ${firstError(result.stderr)}`);
		}
	}
	const reference = await run(join(root, "mixed"), [], root);
	if (!broken && (reference.code !== 0 || !reference.stdout.includes("mix=21"))) {
		broken = true;
		row.details.push(
			`fixture FAIL  ./mixed printed ${JSON.stringify(reference.stdout)} (wants "mix=21")`,
		);
	}

	const plan = await askPlan(plannerBin, root);
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: plan.plain ? "PASS" : "FAIL",
	});
	const section = plan.plain;
	if (!section) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no plain build for this project");
		return { row, findings, broken };
	}

	// 1. The database the hand-off names: one entry per translation unit, each in its own language.
	const database = plan.handoff?.databaseDir ?? null;
	const file = database === null ? null : join(database, "compile_commands.json");
	const cEntry = file === null ? null : compileArguments(file, "mix.c");
	const cxxEntry = file === null ? null : compileArguments(file, "main.cpp");
	const cDriver = cEntry === null ? "" : basename(cEntry[0] ?? "");
	const cxxDriver = cxxEntry === null ? "" : basename(cxxEntry[0] ?? "");
	const cStandard =
		cEntry !== null && cEntry.some((arg) => arg === "-std=c17" || arg === "-std=gnu17");
	const noCxxFlag = cEntry !== null && !cEntry.some((arg) => /^--?std=(gnu\+\+|c\+\+)/.test(arg));
	const cxxStandard =
		cxxEntry !== null && cxxEntry.some((arg) => arg === "-std=c++20" || arg === "-std=gnu++20");
	const languages = cDriver === "clang" && cStandard && noCxxFlag && cxxDriver === "clang++";
	row.details.push(
		`language     ${languages && cxxStandard ? "PASS" : "FAIL"}  ${database === null ? "no database" : relativeTo(root, file as string)}: mix.c is ${JSON.stringify(describeArguments(cEntry))}, main.cpp is ${JSON.stringify(describeArguments(cxxEntry))}`,
	);
	if (!(languages && cxxStandard)) {
		row.build = "FAIL";
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan .\` names ${database === null ? "no compile database" : relativeTo(root, file as string)}, whose mix.c entry is ${JSON.stringify(describeArguments(cEntry))} and whose main.cpp entry is ${JSON.stringify(describeArguments(cxxEntry))}. A C translation unit must be compiled as C and a C++ one as C++, so the .c entry needs the C driver and the C standard, never a C++ one.`,
		);
	}

	// 2. The build the product reports: the sequence, then what it produced.
	const ran = await runPlainBuild(root, section, directory, row);
	if (!ran.ok) {
		findings.push(
			`${directory}: the plain build fails — ${ran.reason}${section.note ? ` (it noted: ${section.note})` : ""}.`,
		);
	} else {
		row.details.push(`build        PASS  ${plainCommands(section).length} command(s)`);
	}
	const artifact = plan.targets[0]?.program ?? null;
	const executed = artifact === null ? null : await run(artifact, [], root);
	const prints = executed !== null && executed.code === 0 && executed.stdout.includes("mix=21");
	row.commands.push({
		line: `cd ${directory} && ${artifact === null ? "(no artifact)" : relativeTo(root, artifact)}`,
		verdict: prints ? "PASS" : "FAIL",
	});
	row.targets = prints ? "PASS" : "FAIL";
	row.details.push(
		`targets      ${prints ? "PASS" : "FAIL"}  ${artifact === null ? "no target" : relativeTo(root, artifact)} printed ${executed === null ? "nothing" : JSON.stringify(executed.stdout.trim())} (wants "mix=21")`,
	);
	if (!prints) {
		findings.push(
			`${directory}: the built program ${artifact === null ? "is unset" : relativeTo(root, artifact)} printed ${executed === null ? "nothing" : JSON.stringify(executed.stdout.trim())} (exit ${executed?.code ?? "none"}), so the value the C function returns does not cross the extern "C" boundary — \`cd ${directory} && ls -l ${artifact === null ? "." : relativeTo(root, artifact)}\`.`,
		);
	}
	row.build = languages && cxxStandard && ran.ok && prints ? "PASS" : "FAIL";

	// 3. Analysis in both translation units, with no diagnostic: an error in mix.c means its
	//    command is not a C one, however plausible the hover looks.
	const handoffArgs = plan.handoff?.args ?? [];
	const clangdCommand = commandLine(root, ["clangd", ...handoffArgs]);
	const clangdLine = row.commands.length;
	row.commands.push({ line: `cd ${directory} && ${clangdCommand}`, verdict: "PASS" });
	const measured = await analyse(clangd, root, fixture.probes, handoffArgs);
	let analysed = true;
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const diagnostics = measured[index]?.diagnostics ?? [];
		const ok = (hover?.includes(probe.expect) ?? false) && diagnostics.length === 0;
		const text = readFileSync(join(root, probe.file), "utf8");
		const position = positionOf(text, probe.needle);
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file}:${position.line + 1}:${position.character + 1} \`${probe.needle}\` -> ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok) {
			analysed = false;
			findings.push(
				`${directory}: the analysis cannot answer at ${probe.file}:${position.line + 1}:${position.character + 1} as ${probe.file.endsWith(".c") ? "C" : "C++"}, which needs ${probe.needs}. \`cd ${directory} && ${clangdCommand}\` answers ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}${database === null ? "" : `; the plan named ${relativeTo(root, file as string)}`}.`,
			);
		}
	});
	row.analysis = analysed ? "PASS" : "FAIL";
	row.commands[clangdLine].verdict = row.analysis;
	return { row, findings, broken };
}
