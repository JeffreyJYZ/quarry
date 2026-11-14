/**
 * One configuration of a multi-config tree: the configuration reaching `--config`, the artefact the
 * plan names, the build writing it, and the analysis reading that configuration's own command.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { analyse, positionOf } from "../analysis";
import { runBuild } from "../build";
import type { AnalysisProbe } from "../fixtures/types";
import { commandLine, describe } from "../format";
import { relativeTo } from "../paths";
import { askPlan } from "../plan";
import { isFile, run } from "../process";
import type { Row } from "../types";
import type { ConfigHalf } from "./multi-config-debug";

export async function judgeConfigHalf(
	root: string,
	plannerBin: string,
	cmake: string,
	clangd: string,
	row: Row,
	findings: string[],
	half: ConfigHalf,
): Promise<{
	passed: boolean;
	named: boolean;
	analysed: boolean;
	broke: boolean;
	buildRoot: string | null;
}> {
	const directory = basename(root);
	let passed = true;
	let named = true;
	let analysed = true;
	const plan = await askPlan(plannerBin, root, { profile: half.profile });
	const section = plan.cmake;
	if (!section) {
		row.details.push(`fixture FAIL  ${half.profile}: the product reports no CMake plan`);
		return { passed, named, analysed, broke: true, buildRoot: null };
	}
	const buildRoot = section.buildRoot;
	const forced = section.configure.find((arg) => arg.startsWith("-DCMAKE_BUILD_TYPE="));
	const builds = section.build.includes("--config") && section.build.includes(half.configuration);
	row.details.push(
		`profile      ${forced === undefined && builds ? "PASS" : "FAIL"}  ${half.profile}: configure ${forced === undefined ? "names no build type" : `forces ${forced}`}, build ${builds ? `names ${half.configuration}` : `does not name ${half.configuration}`}`,
	);
	if (forced !== undefined || !builds) {
		passed = false;
		findings.push(
			`${directory}: the ${half.profile} plan must let the generator take its configuration at build time, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` runs ${commandLine(root, section.configure)} and ${commandLine(root, section.build)}. A multi-config tree never gets a -DCMAKE_BUILD_TYPE.`,
		);
	}

	// The target the dropdown names, before the build: it must be this configuration's artefact.
	const target = plan.targets[0] ?? null;
	const program = target?.program ?? null;
	const artifact =
		target === null ? null : join(section.buildRoot, half.configuration, target.target);
	const names = program !== null && program === artifact;
	row.details.push(
		`target       ${names ? "PASS" : "FAIL"}  ${half.profile}: the plan names ${program === null ? "no program" : relativeTo(root, program)} (wants ${artifact === null ? "a target" : relativeTo(root, artifact)})`,
	);
	if (!names) {
		named = false;
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${program === null ? "no program" : relativeTo(root, program)} for its first target, but a ${half.configuration} build writes ${artifact === null ? "no artefact" : relativeTo(root, artifact)}. The configuration asked for decides the artefact, not the Debug one.`,
		);
	}

	const ran = await runBuild(root, section, directory, cmake, row);
	if (!ran.ok) {
		row.details.push(`fixture FAIL  ${half.profile}: ${ran.reason}`);
		return { passed, named, analysed, broke: true, buildRoot };
	}
	const written = artifact !== null && isFile(artifact);
	row.details.push(
		`build        ${written ? "PASS" : "FAIL"}  ${half.profile}: ${artifact === null ? "no artefact named" : relativeTo(root, artifact)} ${written ? "written" : "missing"}`,
	);
	if (!written) {
		passed = false;
		findings.push(
			`${directory}: the ${half.profile} build wrote no ${artifact === null ? "artefact" : relativeTo(root, artifact)} — \`cd ${directory} && ${commandLine(root, section.build)}\`.`,
		);
	} else {
		const executed = await run(artifact as string, [], root);
		const prints =
			executed.code === 0 &&
			executed.stdout.includes("variant=7") &&
			executed.stdout.includes(`level=${half.level}`);
		row.commands.push({
			line: `cd ${directory} && ${relativeTo(root, artifact as string)}`,
			verdict: prints ? "PASS" : "FAIL",
		});
		row.details.push(
			`build        ${prints ? "PASS" : "FAIL"}  ${half.profile}: the artefact printed ${JSON.stringify(executed.stdout.trim())} (wants "variant=7 level=${half.level}")`,
		);
		if (!prints) {
			passed = false;
			findings.push(
				`${directory}: the ${half.profile} artefact printed ${JSON.stringify(executed.stdout.trim())} (exit ${executed.code}), so it was not compiled with this configuration's defines — \`cd ${directory} && ${relativeTo(root, artifact as string)}\`.`,
			);
		}
	}

	// Analysis of the configuration just built, through the arguments a session start would use
	// now: the build's own configure rewrote the tree, so the database is derived again for the
	// profile being built, exactly as opening the project again does.
	const session = await askPlan(plannerBin, root, { profile: half.profile });
	const handoffArgs = session.handoff?.args ?? [];
	const clangdCommand = commandLine(root, ["clangd", ...handoffArgs]);
	const probe: AnalysisProbe = {
		file: "main.cpp",
		needle: "PARITY_LEVEL",
		needs: `the ${half.configuration} compile command, which defines PARITY_LEVEL=${half.level}`,
		expect: `Value = \`${half.level}\``,
	};
	const clangdLine = row.commands.length;
	row.commands.push({ line: `cd ${directory} && ${clangdCommand}`, verdict: "PASS" });
	const measured = await analyse(clangd, root, [probe], handoffArgs);
	const hover = measured[0]?.hover ?? null;
	const diagnostics = measured[0]?.diagnostics ?? [];
	const reads = (hover?.includes(probe.expect) ?? false) && diagnostics.length === 0;
	const text = readFileSync(join(root, probe.file), "utf8");
	const position = positionOf(text, probe.needle);
	row.commands[clangdLine].verdict = reads ? "PASS" : "FAIL";
	row.details.push(
		`analysis     ${reads ? "PASS" : "FAIL"}  ${half.profile}: main.cpp:${position.line + 1}:${position.character + 1} \`${probe.needle}\` -> ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
	);
	if (!reads) {
		analysed = false;
		const database = session.handoff?.databaseDir ?? null;
		findings.push(
			`${directory}: the ${half.profile} analysis must read the ${half.configuration} compile command, which defines PARITY_LEVEL=${half.level}, but \`cd ${directory} && ${clangdCommand}\` answers ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}. ${database === null ? "The plan named no compile database" : relativeTo(root, database)} must hold one entry per source for ${half.configuration}, so the hover and the build agree.`,
		);
	}
	return { passed, named, analysed, broke: false, buildRoot };
}
