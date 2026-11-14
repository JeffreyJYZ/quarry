/**
 * The GoogleTest row: the CMake project's suite listed from `.quarry/launch.json`'s program, a
 * program that never answers killed at the dock's own bound, and one case run through
 * `--gtest_filter=Suite.Case`.
 *
 * Every answer comes from `examples/quarry-tests.rs`, which prints the dock's own discovery and
 * report, so a row cannot pass on a list this script parsed for itself.
 */

import { basename, join } from "node:path";
import {
	CASE_OUTPUT,
	GTEST_CASE,
	GTEST_HANG_TARGET,
	GTEST_NAME,
	GTEST_SUITE,
	GTEST_TARGET,
	OTHER_OUTPUT,
	findExecutable,
	relativeProgram,
	writeGtestProject,
	writeLaunch,
} from "./fixtures";
import {
	type Discovery,
	type Report,
	caseCarried,
	describeRun,
	findTest,
	onlyCaseRan,
	timeoutNote,
} from "./judge";
import { layoutOf, spell } from "./platform";
import { type Harness, type Row, ask, command, newRow } from "./row";
import { firstError, run } from "./tools";

/** Build the fixture with this platform's tree, then ask the dock the three questions this row exists for. */
export async function gtestRow(harness: Harness): Promise<Row> {
	const row = newRow("gtest: discovery and one case");
	const root = join(harness.scratch, "gtest");
	const build = join(root, "build");
	writeGtestProject(root);

	const configureArgs = ["-S", root, "-B", build, ...harness.profile.configure];
	const configure = await run(harness.cmake, configureArgs, root, 300_000);
	row.commands.push(
		command(
			spell(["cmake", "-S", ".", "-B", "build", ...harness.profile.configure]),
			root,
			configure,
		),
	);
	if (configure.code !== 0) {
		row.broken = true;
		row.details.push(`fixture FAIL  configure: ${firstError(configure.stderr)}`);
		return row;
	}
	const buildArgs = ["--build", build, ...harness.profile.build];
	const built = await run(harness.cmake, buildArgs, root, 300_000);
	row.commands.push(
		command(spell(["cmake", "--build", "build", ...harness.profile.build]), root, built),
	);
	if (built.code !== 0) {
		row.broken = true;
		row.details.push(`fixture FAIL  build: ${firstError(built.stderr)}`);
		return row;
	}

	const programName = harness.profile.executable(GTEST_TARGET);
	const hangName = harness.profile.executable(GTEST_HANG_TARGET);
	const program = findExecutable(root, programName);
	const hang = findExecutable(root, hangName);
	if (program === null || hang === null) {
		row.broken = true;
		row.details.push(
			`fixture FAIL  the build wrote ${program === null ? "no" : "the"} ${programName} and ${hang === null ? "no" : "the"} ${hangName}`,
		);
		return row;
	}
	row.details.push(`build        PASS  ${relativeProgram(root, program)}`);

	// The tree is the platform fact this row exists to pin: a single-config generator writes the
	// artefact straight into `build/`, with no `<Config>` level, so that is the program a launch file
	// names and the one the dock is asked. A layout the profile did not predict would make every
	// assertion below measure the wrong file.
	const layout = layoutOf(program, harness.profile);
	row.details.push(`layout       ${layout.ok ? "PASS" : "FAIL"}  ${layout.detail}`);
	if (!layout.ok) {
		row.broken = true;
		return row;
	}

	// 1. A program that never answers must be killed at the dock's own 20 s bound, not wedge the
	//    tree. This is the only row that measures the bound instead of restating the constant.
	writeLaunch(root, relativeProgram(root, hang));
	const killed = await ask<Discovery>(harness, root, "discovery");
	const killedNote = killed.value === null ? null : timeoutNote(killed.value, 20);
	row.commands.push({
		line: killed.line,
		verdict: killedNote === null ? "FAIL" : "PASS",
		detail: killed.error ?? "",
	});
	row.details.push(
		`kill         ${killedNote === null ? "FAIL" : "PASS"}  ${killedNote ?? killed.error ?? "no timeout note"}`,
	);
	if (killedNote === null) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: discovery of a program that never answers must be killed and reported, but \`${killed.line}\` ${killed.error === null ? `answered notes ${JSON.stringify(killed.value?.notes ?? [])}` : `failed: ${killed.error}`}.`,
		);
	}

	// 2. The suite and case must come from `<program> --gtest_list_tests`, named the way the dock
	//    names them, and the program the dock asked must be the built executable.
	writeLaunch(root, relativeProgram(root, program));
	const listed = await ask<Discovery>(harness, root, "discovery");
	const item = listed.value === null ? null : findTest(listed.value, GTEST_NAME, "gtest");
	const namedProgram = listed.value?.program ?? null;
	const askedProgram = namedProgram !== null && basename(namedProgram) === basename(program);
	row.commands.push({
		line: listed.line,
		verdict: item === null ? "FAIL" : "PASS",
		detail: listed.error ?? "",
	});
	row.details.push(
		`discovery    ${item === null ? "FAIL" : "PASS"}  ${item === null ? (listed.error ?? "no case named") : `${item.name} from ${item.binary}, dock asked ${askedProgram ? basename(namedProgram ?? "") : JSON.stringify(namedProgram)}`}`,
	);
	if (item === null) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${listed.line}\` must list ${GTEST_NAME} under suite ${GTEST_SUITE}, but ${listed.error === null ? `answered ${JSON.stringify(listed.value?.items ?? [])} with notes ${JSON.stringify(listed.value?.notes ?? [])}` : `failed: ${listed.error}`}.`,
		);
	}

	// 3. The case runs with `--gtest_filter=Suite.Case`, passes, its own output reaches the report
	//    the dock shows, and a sibling case's output proves the filter reached the binary.
	const ran = await ask<Report>(harness, root, "report", GTEST_NAME);
	const framed = caseCarried(ran.value, CASE_OUTPUT);
	const isolated = onlyCaseRan(ran.value, OTHER_OUTPUT);
	const carried = framed && isolated;
	row.commands.push({
		line: ran.line,
		verdict: carried ? "PASS" : "FAIL",
		detail: ran.error ?? "",
	});
	row.details.push(
		`run          ${carried ? "PASS" : "FAIL"}  ${describeRun(ran.value)}${framed && !isolated ? ", a sibling case's output leaked through the filter" : ""}`,
	);
	if (!carried) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${ran.line}\` must run ${GTEST_CASE} through --gtest_filter and carry "${CASE_OUTPUT}" without a sibling case's output, but ${ran.error === null ? `the report is ${describeRun(ran.value)}${framed && !isolated ? ` and holds "${OTHER_OUTPUT}"` : ""}` : `failed: ${ran.error}`}.`,
		);
	}

	row.verdict = killedNote !== null && item !== null && carried ? "PASS" : "FAIL";
	return row;
}
