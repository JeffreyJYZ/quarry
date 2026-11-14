/**
 * What both Windows test-runner rows share: the harness they measure, the report they fill, and
 * one command line kept with its exit code and first stderr lines.
 */

import type { Verdict } from "./judge";
import { type RunResult, firstError, productAnswer, run } from "./tools";

/** What a row needs from the machine and the product. */
export interface Harness {
	/** The `quarry-tests` binary built from this tree. */
	tests: string;
	/** Where the fixtures are written; findings print absolute paths under it. */
	scratch: string;
	/** The Visual Studio generator this machine can configure with. */
	generator: string;
	cmake: string;
}

export interface CommandLine {
	line: string;
	verdict: Verdict;
	/** Why it failed: exit code and the first stderr lines. */
	detail: string;
}

export interface Row {
	capability: string;
	verdict: Verdict;
	details: string[];
	commands: CommandLine[];
	findings: string[];
	/** A fixture or seam defect rather than a product finding: the probe exits 2. */
	broken: boolean;
}

/** A command as a report line, with its failure text kept for a finding. */
export function command(line: string, cwd: string, result: RunResult): CommandLine {
	return {
		line: `cd ${cwd} && ${line}`,
		verdict: result.code === 0 ? "PASS" : "FAIL",
		detail:
			result.code === 0
				? ""
				: `exit ${result.code}: ${firstError(result.stderr || result.stdout)}`,
	};
}

export interface Asked<T> {
	value: T | null;
	error: string | null;
	line: string;
}

/** Ask the product one question and keep the command that asked it. */
export async function ask<T>(
	harness: Harness,
	root: string,
	key: string,
	name?: string,
): Promise<Asked<T>> {
	const args = name === undefined ? [root] : [root, "--run", name];
	const result = await run(harness.tests, args, root, 300_000);
	const answer = productAnswer<T>(result, key);
	const spelled = name === undefined ? "." : `. --run ${name}`;
	const line = `cd ${root} && ${harness.tests} ${spelled}`;
	const error =
		answer.error ??
		(result.code === 0 ? null : `exit ${result.code}: ${firstError(result.stderr)}`);
	return { value: answer.value, error, line };
}

/** A new row, before anything is measured. */
export function newRow(capability: string): Row {
	return { capability, verdict: "FAIL", details: [], commands: [], findings: [], broken: false };
}
