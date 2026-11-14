/**
 * One configuration of the generator row: the plan's argv, the synthesised database, the artefact
 * it names, and the analysis that must read this configuration's own command.
 */

import { basename, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import { configProbe, VS_EXE, type VsHalf } from "../fixtures/windows";
import type { Plan, Row, Verdict } from "../types";
import { errorLines, type WindowsHarness } from "../windows";
import {
	entriesFor,
	judgeAnalysis,
	normalised,
	samePath,
	shown,
	verbatimArguments,
} from "./windows-common";

export async function judgeHalf(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
	row: Row,
	half: VsHalf,
	findings: string[],
): Promise<{ ok: boolean; named: boolean; plan: Plan | null; broken: boolean; analysis: Verdict }> {
	const directory = basename(root);
	let plan: Plan;
	try {
		plan = await harness.ask({ profile: half.profile });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.details.push(
			`profile      FAIL  ${half.profile}: the product cannot be asked: ${message}`,
		);
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` answers: ${message}`,
		);
		return { ok: false, named: false, plan: null, broken: false, analysis: "n/a" };
	}
	row.commands.push({
		line: `cd ${directory} && quarry-plan . --profile ${half.profile}`,
		verdict: "PASS",
	});
	const section = plan.cmake;
	if (!section) {
		row.details.push(`plan         FAIL  ${half.profile}: the product reports no CMake plan`);
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` reports no CMake plan for a CMake project, so nothing can be built or analysed.`,
		);
		return { ok: false, named: false, plan: null, broken: false, analysis: "n/a" };
	}

	// 1. The configuration belongs on the build line, never as a CMAKE_BUILD_TYPE this tree ignores.
	const forced = section.configure.find((arg) => arg.startsWith("-DCMAKE_BUILD_TYPE="));
	const index = section.build.indexOf("--config");
	const buildsConfig = index >= 0 && section.build[index + 1] === half.configuration;
	row.details.push(
		`profile      ${forced === undefined && buildsConfig ? "PASS" : "FAIL"}  ${half.profile}: configure ${forced === undefined ? "names no build type" : `forces ${forced}`}, build ${buildsConfig ? `names ${half.configuration}` : `does not name ${half.configuration}`}`,
	);
	let ok = forced === undefined && buildsConfig;
	if (!ok) {
		findings.push(
			`${directory}: the ${half.profile} plan must take its configuration from the generator, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` runs ${harness.commandLine(section.configure)} and ${harness.commandLine(section.build)}. A multi-config tree never gets a -DCMAKE_BUILD_TYPE.`,
		);
	}

	// 2. No argument may carry the Win32 verbatim marker: MSBuild and CL reject `\\?\C:\…` where the
	//    same build given `C:\…` succeeds, and that is what made every Windows build fail once.
	const verbatim = verbatimArguments([...section.configure, ...section.build]);
	row.details.push(
		`paths        ${verbatim.length === 0 ? "PASS" : "FAIL"}  ${verbatim.length === 0 ? "no argument carries the Win32 verbatim marker" : `the argv carries ${JSON.stringify(verbatim)}`}`,
	);
	if (verbatim.length > 0) {
		ok = false;
		findings.push(
			`${directory}: the ${half.profile} argv carries the Win32 verbatim marker, which MSBuild and CL reject — ${JSON.stringify(verbatim)}. \`cd ${directory} && quarry-plan . --profile ${half.profile}\` must name the plain drive path.`,
		);
	}

	// 3. The database: the generator wrote none, so the hand-off had to synthesise one, and since
	//    #189 it holds one entry per source for the configuration this build uses. A file with an
	//    entry per configuration is the shape that made clangd read another configuration's flags.
	const database = join(section.buildRoot, "compile_commands.json");
	const entries = entriesFor(database, "main.cpp");
	const entry = harness.compileArguments(database, "main.cpp");
	const synthesised = entry !== null && entries.length === 1;
	row.details.push(
		`database     ${synthesised ? "PASS" : "FAIL"}  ${half.profile}: ${harness.isFile(database) ? shown(root, database) : "no database"} holds ${entries.length} main.cpp entr${entries.length === 1 ? "y" : "ies"}${entry === null ? "" : ` (${JSON.stringify(entry.slice(0, 8))})`}`,
	);
	ok = ok && synthesised;
	if (!synthesised) {
		findings.push(
			`${directory}: the ${half.profile} session must analyse a database synthesised from the file API holding one entry per source for ${half.configuration}, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${harness.isFile(database) ? shown(root, database) : "no database"} with ${entries.length} main.cpp entr${entries.length === 1 ? "y" : "ies"}${entry === null ? " and no readable command" : ""}. \`cd ${directory} && rg -- '"file": ".*/main.cpp"' ${shown(root, database)}\`.`,
		);
	}

	// 3. The build exactly as reported, and the artefact the plan named.
	const program = section.program ?? "cmake";
	const configure = await harness.run(program, section.configure.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.configure)}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	if (configure.code !== 0) {
		row.details.push(`build        FAIL  ${half.profile}: configure exited ${configure.code}`);
		for (const line of errorLines(configure.stderr)) row.details.push(`stderr       ${line}`);
		findings.push(
			`${directory}: the ${half.profile} build fails — \`cd ${directory} && ${harness.commandLine(section.configure)}\` exits ${configure.code}.`,
		);
		return { ok: false, named: false, plan, broken: false, analysis: "n/a" };
	}
	const built = await harness.run(program, section.build.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.build)}`,
		verdict: built.code === 0 ? "PASS" : "FAIL",
	});
	if (built.code !== 0) {
		row.details.push(`build        FAIL  ${half.profile}: build exited ${built.code}`);
		for (const line of errorLines(built.stderr)) row.details.push(`stderr       ${line}`);
		findings.push(
			`${directory}: the ${half.profile} build fails — \`cd ${directory} && ${harness.commandLine(section.build)}\` exits ${built.code}.`,
		);
		return { ok: false, named: false, plan, broken: false, analysis: "n/a" };
	}

	// The artefact the plan names is the file this configuration's build wrote. The two strings
	//    may spell one file differently — the fixture root reaches the probe as a Windows short (8.3)
	//    path while CMake's reply names the long form — so identity is decided by the filesystem, and
	//    the configuration asked for must still appear in the path the plan names.
	const artifact = plan.targets[0]?.program ?? null;
	const expected = join(section.buildRoot, half.configuration, VS_EXE);
	const sameFile = artifact !== null && samePath(artifact, expected);
	const inConfiguration =
		artifact !== null && normalised(artifact).split("/").includes(half.configuration);
	const names = sameFile && inConfiguration;
	const written = harness.isFile(expected);
	row.details.push(
		names
			? `target       PASS  ${half.profile}: the plan names ${artifact === null ? "no program" : shown(root, artifact)} (this build writes ${shown(root, expected)})`
			: `target       FAIL  ${half.profile}: the plan names ${JSON.stringify(artifact)} (this build writes ${JSON.stringify(expected)})`,
	);
	if (!names) {
		// Both paths raw: a diagnostic that relativises the very string it compared hid a short-path
		// mismatch for a whole CI run, so the failure prints what was actually compared.
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${JSON.stringify(artifact)} for its first target, but the ${half.configuration} build writes ${JSON.stringify(expected)}. The configuration asked for decides the artefact.`,
		);
	}
	const executed = written ? await harness.run(expected, [], root) : null;
	const prints =
		executed !== null && executed.code === 0 && executed.stdout.includes(half.printed);
	row.commands.push({
		line: `cd ${directory} && ${shown(root, expected)}`,
		verdict: prints ? "PASS" : "FAIL",
	});
	row.details.push(
		`build        ${written && prints ? "PASS" : "FAIL"}  ${half.profile}: ${shown(root, expected)} ${written ? "written" : "missing"}, printed ${executed === null ? "nothing" : JSON.stringify(executed.stdout.trim())} (wants ${JSON.stringify(half.printed)})`,
	);
	if (!prints) {
		findings.push(
			`${directory}: the ${half.profile} artefact ${shown(root, expected)} ${written ? `printed ${JSON.stringify(executed?.stdout.trim() ?? "")} (exit ${executed?.code ?? "none"})` : "was not written"} — \`cd ${directory} && ${harness.commandLine(section.build)}\`.`,
		);
	}
	// 4. Analysis of *this* configuration: the plan's own clangd arguments, and the define this
	//    configuration compiles with. A database holding another configuration's command answers the
	//    other number, which is exactly the failure #189 fixed.
	const analysis = await judgeAnalysis(fixture, root, harness, row, findings, plan, [
		configProbe(half),
	]);
	return { ok: ok && written && prints, named: names, plan, broken: false, analysis };
}
