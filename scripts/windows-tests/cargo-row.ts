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

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

/** The crate's test binaries, and the directory cargo was asked to build them in. */
const PACKAGE = "parity_cargo_tests";

/**
 * The test binary cargo built for the fixture, or null when it is not under `target/debug/deps`.
 *
 * The dock reads the executable out of cargo's own JSON, so this asserts the fixture's side of that
 * bargain: `cargo test --no-run` writes the harness binary into the debug profile, and a row that
 * found it elsewhere would be judging a stale or wrongly-profiled build. `CARGO_TARGET_DIR` is
 * honoured because a runner may redirect it, and it is resolved against the project root the way
 * cargo resolves it.
 */
function testBinary(root: string): string | null {
	const configured = process.env.CARGO_TARGET_DIR?.trim();
	const base =
		configured === undefined || configured === ""
			? join(root, "target")
			: resolve(root, configured);
	const deps = join(base, "debug", "deps");
	if (!existsSync(deps)) return null;
	for (const name of readdirSync(deps)) {
		if (!name.startsWith(`${PACKAGE}-`)) continue;
		if (/\.(d|rlib|pdb|rmeta)$/.test(name)) continue;
		const path = join(deps, name);
		try {
			const stat = statSync(path);
			const runnable = process.platform === "win32" || (stat.mode & 0o111) !== 0;
			if (stat.isFile() && runnable) return path;
		} catch {
			// An entry that cannot be read cannot be the binary; the next name is tried.
		}
	}
	return null;
}

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

	// The dock reads the executable out of cargo's JSON rather than assuming a path, so the fixture's
	// own build has to be where cargo put it before a case run can mean anything.
	const binary = testBinary(root);
	row.details.push(
		`artefacts    ${binary === null ? "FAIL" : "PASS"}  ${
			binary === null
				? `no ${PACKAGE}-* test binary under target/debug/deps`
				: relative(root, binary)
		}`,
	);
	if (binary === null) {
		row.broken = true;
		return row;
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
