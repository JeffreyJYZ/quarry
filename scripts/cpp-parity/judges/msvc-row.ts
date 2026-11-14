/**
 * The `toolchain: MSVC` parity row, judged end to end.
 *
 * It runs the plan's own configure and build and starts clangd with the product's own arguments, so
 * it re-implements no decision. What it adds is the Windows evidence: that the database's commands
 * are MSVC's, the hand-off names `cl.exe`, and the analysis resolves a project header and `<vector>`.
 */

import { basename, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import type { Plan, Row } from "../types";
import { errorLines, type WindowsHarness } from "../windows";
import {
	blankRow,
	fixtureBuild,
	judgeAnalysis,
	normalised,
	shown,
	toolsetGuard,
	verbatimArguments,
} from "./windows-common";

/**
 * The compiler row: the database's commands are MSVC's, the hand-off names `cl.exe`, and the
 * analysis resolves a project header and `<vector>`.
 *
 * The control run is the same clangd with only `--compile-commands-dir`. If it also answers, that is
 * said out loud rather than turned into a failure: the row still proves the hand-off names the
 * driver, and it was clangd that did not need the name here.
 */
export async function judgeMsvcToolchain(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	harness.writeFixture();
	const row = blankRow(fixture.name);
	const findings: string[] = [];
	const broken = false;

	// The tree first, exactly as the generator row builds it: a CLion profile on Windows always has a
	// configured tree, and a fresh one would be configured by whatever CMake defaults to rather than
	// by the generator this row was chosen for.
	const own = await fixtureBuild(fixture, root, harness, row);
	if (!own.ok) {
		const lines = errorLines(own.stderr);
		row.details.push(
			`fixture FAIL  the fixture's own build failed (${lines.length} line(s) of stderr)`,
		);
		for (const line of lines) row.details.push(`stderr       ${line}`);
		const skipped = toolsetGuard(own.stderr, fixture.name, findings);
		if (skipped !== null) return skipped;
		return { row, findings, broken: true };
	}

	let plan: Plan;
	try {
		plan = await harness.ask();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.details.push(`plan         FAIL  the product cannot be asked: ${message}`);
		findings.push(`${directory}: \`cd ${directory} && quarry-plan .\` answers: ${message}`);
		return { row, findings, broken: false };
	}
	row.commands.push({ line: `cd ${directory} && quarry-plan .`, verdict: "PASS" });
	const section = plan.cmake;
	if (!section) {
		row.details.push("fixture FAIL  the product reports no CMake plan for this project");
		return { row, findings, broken: true };
	}

	// 1. The command line the database records is MSVC's, and its include path is `/I`.
	const database = join(section.buildRoot, "compile_commands.json");
	const entry = harness.compileArguments(database, "main.cpp");
	const driver = entry === null || entry[0] === undefined ? "" : basename(normalised(entry[0]));
	const namesCl = driver.toLowerCase() === "cl.exe";
	const includeAt = entry === null ? -1 : entry.indexOf("/I");
	const include = includeAt >= 0 ? (entry?.[includeAt + 1] ?? "") : "";
	row.details.push(
		`database     ${namesCl ? "PASS" : "FAIL"}  the main.cpp command runs ${driver === "" ? "nothing" : driver} (wants cl.exe)`,
	);
	if (!namesCl) {
		findings.push(
			`${directory}: the synthesised database must compile with the compiler the tree was configured with, but its main.cpp entry runs ${driver === "" ? "nothing" : `\`${entry?.[0]}\``} — \`cd ${directory} && rg -- '"file": ".*/main.cpp"' ${shown(root, database)}\`.`,
		);
	}
	row.details.push(
		`database     ${includeAt >= 0 ? "PASS" : "FAIL"}  the include path is ${includeAt >= 0 ? `/I ${shown(root, include)}` : "not an /I flag"}`,
	);
	if (includeAt < 0) {
		findings.push(
			`${directory}: cl.exe takes its include paths as /I, but the synthesised main.cpp entry carries ${entry === null ? "no arguments" : JSON.stringify(entry.slice(1, 8))} — \`cd ${directory} && rg -- '/I' ${shown(root, database)}\`.`,
		);
	}

	// 2. No argument may carry the Win32 verbatim marker; `cmake --build \\?\C:\…` is a build that
	//    exits non-zero for a path, not for the project.
	const verbatim = verbatimArguments([...section.configure, ...section.build]);
	row.details.push(
		`paths        ${verbatim.length === 0 ? "PASS" : "FAIL"}  ${verbatim.length === 0 ? "no argument carries the Win32 verbatim marker" : `the argv carries ${JSON.stringify(verbatim)}`}`,
	);
	if (verbatim.length > 0) {
		findings.push(
			`${directory}: the plan's argv carries the Win32 verbatim marker, which MSBuild and CL reject — ${JSON.stringify(verbatim)}.`,
		);
	}

	// 2. The build the plan reports, run as reported: the artefact must be the plan's own.
	const program = section.program ?? "cmake";
	const configure = await harness.run(program, section.configure.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.configure)}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	const built =
		configure.code === 0
			? await harness.run(program, section.build.slice(1), section.cwd)
			: null;
	if (built !== null) {
		row.commands.push({
			line: `cd ${directory} && ${harness.commandLine(section.build)}`,
			verdict: built.code === 0 ? "PASS" : "FAIL",
		});
	}
	if (configure.code !== 0 || built?.code !== 0) {
		const failed = configure.code === 0 ? built : configure;
		const line = harness.commandLine(configure.code === 0 ? section.build : section.configure);
		row.details.push(`build        FAIL  ${line} exited ${failed?.code}`);
		for (const excerpt of errorLines(failed?.stderr ?? ""))
			row.details.push(`stderr       ${excerpt}`);
		findings.push(
			`${directory}: the MSVC build fails — \`cd ${directory} && ${line}\` exits ${failed?.code}.`,
		);
		return { row, findings, broken: false };
	}
	// The dropdown's answer after the build: the target list is refreshed the way the app refreshes
	// it, so this is the program Run would launch rather than a prediction made before configure.
	const after = await harness.ask();
	row.commands.push({ line: `cd ${directory} && quarry-plan .`, verdict: "PASS" });
	const artifact = after.targets[0]?.program ?? null;
	const written = artifact !== null && harness.isFile(artifact);
	const executed = written && artifact !== null ? await harness.run(artifact, [], root) : null;
	const prints = executed?.stdout.includes("config=1") === true;
	row.details.push(
		`build        ${written && prints ? "PASS" : "FAIL"}  the plan's target ${artifact === null ? "is unset" : shown(root, artifact)} ${written ? "exists" : "does not exist"}${executed === null ? "" : ` and printed ${JSON.stringify(executed.stdout.trim())}`}`,
	);
	if (!(written && prints)) {
		findings.push(
			`${directory}: after the build the target list names ${artifact === null ? "no program" : shown(root, artifact)}, which ${written ? `printed ${JSON.stringify(executed?.stdout.trim() ?? "")} (exit ${executed?.code ?? "none"})` : "does not exist"} — \`cd ${directory} && ls -l ${artifact === null ? "." : shown(root, artifact)}\`.`,
		);
	}

	// 3. The analysis: clangd told to query cl.exe, and answering in both the project header and the
	//    standard one.
	const query = (plan.handoff?.args ?? []).find((arg) => arg.startsWith("--query-driver="));
	const drivers = query === undefined ? [] : query.slice("--query-driver=".length).split(",");
	const named = drivers.some((path) => basename(normalised(path)).toLowerCase() === "cl.exe");
	row.details.push(
		`handoff      ${named ? "PASS" : "FAIL"}  ${query === undefined ? "no --query-driver" : `--query-driver names ${drivers.map((path) => basename(normalised(path))).join(",")}`} (wants cl.exe)`,
	);
	if (!named) {
		findings.push(
			`${directory}: clangd cannot find MSVC's headers unless the hand-off names the driver it was built with, but \`cd ${directory} && quarry-plan .\` composes ${query === undefined ? "no --query-driver at all" : `\`${query}\``}.`,
		);
	}
	const analysed = await judgeAnalysis(fixture, root, harness, row, findings, plan);

	// 4. The control: the same clangd, told only where the database is.
	const control = await harness.analyse(fixture.probes, [
		`--compile-commands-dir=${section.buildRoot}`,
	]);
	const blind = control.some((measurement, index) => {
		const probe = fixture.probes[index];
		return probe === undefined || !(measurement.hover?.includes(probe.expect) ?? false);
	});
	row.details.push(
		blind
			? "control      PASS  without --query-driver the same clangd cannot read MSVC's headers"
			: "control      note  clangd answered without --query-driver here, so this row proves the hand-off names cl.exe but not that the name was needed on this machine",
	);
	row.build = namesCl && includeAt >= 0 && verbatim.length === 0 && prints ? "PASS" : "FAIL";
	row.analysis = named && analysed === "PASS" ? "PASS" : analysed === "SKIP" ? "SKIP" : "FAIL";
	if (harness.isFile(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	return { row, findings, broken };
}
