/**
 * The Cargo row: the workspace's own test list, then one test run, both through the dock's
 * commands (`cargo test --no-run --message-format=json` plus one `<executable> --list --format
 * terse` per test target, then `cargo test <name> -- --exact --nocapture`).
 *
 * The list names the test only when the dock's parse and the toolchain resolution both work: on
 * Windows `cargo` is `cargo.exe`, and the row is what proved the shared resolver did not look for
 * that suffix. It also pins the file the case is grouped under, because cargo's merged stream
 * labels an integration test with the lib's `Running unittests src/lib.rs` header.
 */

import { join } from "node:path";
import { CARGO_TEST, CARGO_TEST_SOURCE, relativeProgram, writeCargoProject } from "./fixtures";
import {
	type Discovery,
	type Report,
	caseCarried,
	describeRun,
	findTest,
	groupedUnder,
} from "./judge";
import { type Harness, type Row, ask, newRow } from "./row";

/** Ask the dock for the Cargo project's tests, then run the one the row names. */
export async function cargoRow(harness: Harness): Promise<Row> {
	const row = newRow("cargo: discovery and one test");
	const root = join(harness.scratch, "cargo");
	writeCargoProject(root);

	const listed = await ask<Discovery>(harness, root, "discovery");
	const found = listed.value === null ? null : findTest(listed.value, CARGO_TEST, "cargo");
	const labelled = groupedUnder(found, CARGO_TEST_SOURCE);
	row.commands.push({
		line: listed.line,
		verdict: labelled ? "PASS" : "FAIL",
		detail: listed.error ?? "",
	});
	row.details.push(
		`discovery    ${labelled ? "PASS" : "FAIL"}  ${found === null ? (listed.error ?? "no test named") : `${found.name} from ${found.binary}`}`,
	);
	if (found === null) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${listed.line}\` must name ${CARGO_TEST} from cargo's own list, but ${listed.error === null ? `answered ${JSON.stringify(listed.value?.items ?? [])} with notes ${JSON.stringify(listed.value?.notes ?? [])}` : `failed: ${listed.error}`}.`,
		);
	} else if (!labelled) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${listed.line}\` must label ${CARGO_TEST} with ${CARGO_TEST_SOURCE}, the file it lives in, but named ${found.binary}.`,
		);
	}

	const ran = await ask<Report>(harness, root, "report", CARGO_TEST);
	const carried = caseCarried(ran.value, "1 passed");
	row.commands.push({
		line: ran.line,
		verdict: carried ? "PASS" : "FAIL",
		detail: ran.error ?? "",
	});
	row.details.push(`run          ${carried ? "PASS" : "FAIL"}  ${describeRun(ran.value)}`);
	if (!carried) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${ran.line}\` must run ${CARGO_TEST} and keep cargo's own summary, but ${ran.error === null ? `the report is ${describeRun(ran.value)}` : `failed: ${ran.error}`}.`,
		);
	}
	row.verdict = labelled && carried ? "PASS" : "FAIL";
	return row;
}
