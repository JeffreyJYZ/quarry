/**
 * The Cargo row: the workspace's own test list, then one test run, both through the dock's
 * commands (`cargo test -- --list --format terse`, then `cargo test <name> -- --exact
 * --nocapture`).
 *
 * The list names the test only when the dock's parse and the toolchain resolution both work: on
 * Windows `cargo` is `cargo.exe`, and the row is what proved the shared resolver did not look for
 * that suffix.
 */

import { join } from "node:path";
import { CARGO_TEST, relativeProgram, writeCargoProject } from "./fixtures";
import { type Discovery, type Report, caseCarried, describeRun, findTest } from "./judge";
import { type Harness, type Row, ask, newRow } from "./row";

/** Ask the dock for the Cargo project's tests, then run the one the row names. */
export async function cargoRow(harness: Harness): Promise<Row> {
	const row = newRow("cargo: discovery and one test");
	const root = join(harness.scratch, "cargo");
	writeCargoProject(root);

	const listed = await ask<Discovery>(harness, root, "discovery");
	const item = listed.value === null ? null : findTest(listed.value, CARGO_TEST, "cargo");
	row.commands.push({
		line: listed.line,
		verdict: item === null ? "FAIL" : "PASS",
		detail: listed.error ?? "",
	});
	row.details.push(
		`discovery    ${item === null ? "FAIL" : "PASS"}  ${item === null ? (listed.error ?? "no test named") : `${item.name} from ${item.binary}`}`,
	);
	if (item === null) {
		row.findings.push(
			`${relativeProgram(harness.scratch, root)}: \`${listed.line}\` must name ${CARGO_TEST} from cargo's own list, but ${listed.error === null ? `answered ${JSON.stringify(listed.value?.items ?? [])} with notes ${JSON.stringify(listed.value?.notes ?? [])}` : `failed: ${listed.error}`}.`,
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
	row.verdict = item !== null && carried ? "PASS" : "FAIL";
	return row;
}
