#!/usr/bin/env bun
/**
 * The `generator: Visual Studio` and `toolchain: MSVC` parity rows, judged end to end.
 *
 * Both rows run the plan's own configure and build and start clangd with the product's own
 * arguments, so neither re-implements a decision. What they add is the Windows evidence: that the
 * generator writes no database and the one quarry synthesises is usable, that the configuration
 * reaches `--config` instead of `CMAKE_BUILD_TYPE`, that the artefact the plan names is the file
 * that build wrote, and that the command line inside the database is MSVC's.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Fixture } from "./cpp-parity-fixtures";
import type { Plan, Row, Verdict } from "./cpp-parity-probe";
import {
	NO_CLANGD,
	NO_TOOLSET,
	VS_BUILD_DIR,
	VS_EXE,
	VS_GENERATOR,
	VS_HALVES,
	type VsHalf,
	type WindowsHarness,
	toolsetMissing,
} from "./cpp-parity-windows";

/** One entry of the database, as the row reads it back. */
interface DbEntry {
	directory: string;
	file: string;
	arguments?: string[];
	command?: string;
}

/** A path with Windows and POSIX separators made the same, so comparisons are about the path. */
function normalised(path: string): string {
	return path.replaceAll("\\", "/");
}

/** A path relative to the fixture root, for a report line that stays short. */
function shown(root: string, path: string): string {
	const base = `${normalised(root)}/`;
	const full = normalised(path);
	return full.startsWith(base) ? full.slice(base.length) : path;
}

/** Every database entry for `source`, by file name, whichever configuration wrote it. */
function entriesFor(database: string, source: string): DbEntry[] {
	try {
		const all = JSON.parse(readFileSync(database, "utf8")) as DbEntry[];
		return all.filter((entry) => basename(normalised(entry.file)) === source);
	} catch {
		return [];
	}
}

/** An empty row, so both judges start from the same verdicts. */
function blankRow(capability: string): Row {
	return {
		capability,
		build: "FAIL",
		analysis: "FAIL",
		targets: "n/a",
		tree: "PASS",
		details: [],
		commands: [],
	};
}

/** A row that could not run: every column says so, and one line names the reason. */
function skippedRow(
	capability: string,
	reason: string,
	findings: string[],
): {
	row: Row;
	findings: string[];
	broken: boolean;
} {
	const row = blankRow(capability);
	row.build = "SKIP";
	row.analysis = "SKIP";
	row.targets = "SKIP";
	row.tree = "SKIP";
	row.details.push(`skipped      ${reason}`);
	return { row, findings, broken: false };
}

/** The fixture's own build, which is the premise both rows rest on, run before the product is asked. */
async function fixtureBuild(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
	row: Row,
): Promise<{ ok: boolean; reason: string }> {
	harness.writeQuery(VS_BUILD_DIR);
	for (const args of fixture.userBuild ?? []) {
		const result = await harness.run("cmake", args, root);
		row.commands.push({
			line: `cd ${basename(root)} && cmake ${args.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) {
			return { ok: false, reason: harness.firstError(result.stderr) };
		}
	}
	return { ok: true, reason: "" };
}

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
	harness.writeFixture();
	const row = blankRow(fixture.name);
	const findings: string[] = [];
	let broken = false;

	const own = await fixtureBuild(fixture, root, harness, row);
	if (!own.ok) {
		if (toolsetMissing(own.reason))
			return skippedRow(fixture.name, `${NO_TOOLSET}: ${own.reason}`, findings);
		broken = true;
		row.details.push(`fixture FAIL  the fixture's own build failed: ${own.reason}`);
		return { row, findings, broken };
	}

	// The premise: this generator writes no database. If it did, the row would be measuring a file
	// CMake wrote rather than one quarry synthesised, so that is a probe defect, not a verdict.
	if (harness.isFile(join(root, VS_BUILD_DIR, "compile_commands.json"))) {
		broken = true;
		row.details.push(
			`fixture FAIL  ${VS_GENERATOR} wrote a compile_commands.json, so this row cannot measure the synthesis`,
		);
		return { row, findings, broken };
	}
	row.details.push(`generator    PASS  ${VS_GENERATOR} wrote no compile_commands.json`);

	let passed = true;
	let named = true;
	let last: Plan | null = null;
	for (const half of VS_HALVES) {
		const judged = await judgeHalf(root, harness, row, half, findings);
		if (judged.broken) {
			broken = true;
			break;
		}
		last = judged.plan;
		passed = passed && judged.ok;
		named = named && judged.named;
		if (judged.plan === null) break;
	}

	if (last !== null) await judgeAnalysis(fixture, root, harness, row, findings, last);

	if (harness.isFile(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	row.build = passed ? "PASS" : "FAIL";
	row.targets = named ? "PASS" : "FAIL";
	return { row, findings, broken };
}

/** One configuration: the plan's argv, the synthesised database, and the artefact it names. */
async function judgeHalf(
	root: string,
	harness: WindowsHarness,
	row: Row,
	half: VsHalf,
	findings: string[],
): Promise<{ ok: boolean; named: boolean; plan: Plan | null; broken: boolean }> {
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
		return { ok: false, named: false, plan: null, broken: false };
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
		return { ok: false, named: false, plan: null, broken: false };
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

	// 2. The database: the generator wrote none, so the hand-off had to synthesise one, and it must
	//    describe this configuration's own compiles.
	const database = join(section.buildRoot, "compile_commands.json");
	const entry = harness.compileArguments(database, "main.cpp");
	const perConfiguration = entriesFor(database, "main.cpp").some((candidate) =>
		normalised(candidate.directory).endsWith(`/${half.configuration}`),
	);
	const synthesised = entry !== null && perConfiguration;
	const seen = entriesFor(database, "main.cpp").map((candidate) =>
		normalised(candidate.directory),
	);
	row.details.push(
		`database     ${synthesised ? "PASS" : "FAIL"}  ${half.profile}: ${harness.isFile(database) ? shown(root, database) : "no database"} ${synthesised ? `holds main.cpp for ${half.configuration}` : `has no main.cpp entry for ${half.configuration} (entries: ${JSON.stringify(seen)})`}`,
	);
	ok = ok && synthesised;
	if (!synthesised) {
		findings.push(
			`${directory}: the ${half.profile} session must analyse a database synthesised from the file API, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${harness.isFile(database) ? shown(root, database) : "no database"} whose main.cpp entry for ${half.configuration} is ${entry === null ? "absent" : "present but in another configuration"}.`,
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
		const reason = harness.firstError(configure.stderr);
		row.details.push(
			`build        FAIL  ${half.profile}: configure exited ${configure.code}: ${reason}`,
		);
		findings.push(
			`${directory}: the ${half.profile} build fails — \`cd ${directory} && ${harness.commandLine(section.configure)}\` exits ${configure.code}: "${reason}".`,
		);
		return { ok: false, named: false, plan, broken: false };
	}
	const built = await harness.run(program, section.build.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.build)}`,
		verdict: built.code === 0 ? "PASS" : "FAIL",
	});
	if (built.code !== 0) {
		const reason = harness.firstError(built.stderr);
		row.details.push(
			`build        FAIL  ${half.profile}: build exited ${built.code}: ${reason}`,
		);
		findings.push(
			`${directory}: the ${half.profile} build fails — \`cd ${directory} && ${harness.commandLine(section.build)}\` exits ${built.code}: "${reason}".`,
		);
		return { ok: false, named: false, plan, broken: false };
	}

	const artifact = plan.targets[0]?.program ?? null;
	const expected = join(section.buildRoot, half.configuration, VS_EXE);
	const names = artifact !== null && normalised(artifact) === normalised(expected);
	const written = harness.isFile(expected);
	row.details.push(
		`target       ${names ? "PASS" : "FAIL"}  ${half.profile}: the plan names ${artifact === null ? "no program" : shown(root, artifact)} (this build writes ${shown(root, expected)})`,
	);
	if (!names) {
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${artifact === null ? "no program" : shown(root, artifact)} for its first target, but the ${half.configuration} build writes ${shown(root, expected)}. The configuration asked for decides the artefact.`,
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
	return { ok: ok && written && prints, named, plan, broken: false };
}

/** The analysis both rows share: the product's clangd arguments, and the probes they must answer. */
async function judgeAnalysis(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
	row: Row,
	findings: string[],
	plan: Plan,
): Promise<Verdict> {
	const directory = basename(root);
	if (harness.clangd === null) {
		row.analysis = "SKIP";
		row.details.push(`analysis     SKIP  ${NO_CLANGD}`);
		return "SKIP";
	}
	const args = plan.handoff?.args ?? [];
	const product = harness.commandLine(["clangd", ...args]);
	const line = row.commands.length;
	row.commands.push({ line: `cd ${directory} && ${product}`, verdict: "PASS" });
	const measured = await harness.analyse(fixture.probes, args);
	let analysed = true;
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const diagnostics = measured[index]?.diagnostics ?? [];
		const ok = hover?.includes(probe.expect) ?? false;
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file} \`${probe.needle}\` -> ${hover === null ? "nothing" : JSON.stringify(hover.slice(0, 120))}${diagnostics.length > 0 ? `, with ${JSON.stringify(diagnostics[0].slice(0, 80))}` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok) {
			analysed = false;
			findings.push(
				`${directory}: the analysis cannot answer \`${probe.needle}\` in ${probe.file}, which needs ${probe.needs}. \`cd ${directory} && ${product}\` answers ${hover === null ? "nothing" : JSON.stringify(hover.slice(0, 120))}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}.`,
			);
		}
	});
	row.analysis = analysed ? "PASS" : "FAIL";
	row.commands[line].verdict = row.analysis;
	return row.analysis;
}

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

	let plan: Plan;
	try {
		plan = await harness.ask();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.details.push(`fixture FAIL  the product cannot be asked: ${message}`);
		return skippedRow(fixture.name, `${NO_TOOLSET}: ${message}`, findings);
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
		const reason = harness.firstError(failed?.stderr ?? "");
		row.details.push(`build        FAIL  ${line} exited ${failed?.code}: ${reason}`);
		findings.push(
			`${directory}: the MSVC build fails — \`cd ${directory} && ${line}\` exits ${failed?.code}: "${reason}".`,
		);
		return { row, findings, broken: false };
	}
	const artifact = plan.targets[0]?.program ?? null;
	const prints = artifact !== null && harness.isFile(artifact);
	row.details.push(
		`build        ${prints ? "PASS" : "FAIL"}  the plan's target ${artifact === null ? "is unset" : shown(root, artifact)} ${prints ? "exists" : "does not exist"}`,
	);

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
	row.build = namesCl && includeAt >= 0 && prints ? "PASS" : "FAIL";
	row.analysis = named && analysed === "PASS" ? "PASS" : analysed === "SKIP" ? "SKIP" : "FAIL";
	if (harness.isFile(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	return { row, findings, broken };
}
