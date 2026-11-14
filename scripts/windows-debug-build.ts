#!/usr/bin/env bun
/**
 * The build half of the debugger row: configure the fixture with one generator, build `Debug`, and
 * say where the binary landed.
 *
 * A successful configure is not a successful build, and a successful build is not an artefact: a
 * generator whose toolset is absent fails the configure, and one whose output directory differs says
 * so by writing nothing at the path the row looks at. Each of those is a different verdict, so each
 * is decided here rather than inferred from the next step's failure.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { errorLines, NO_TOOLSET, toolsetMissing } from "./cpp-parity/windows";
import { artifactList, CONFIGURATION, programPath } from "./windows-debug-fixture";
import { configureArgs } from "./windows-debug-local";
import type { RunOutcome } from "./windows-debug-toolchain";

/** How the row runs a command: the toolchain runner, narrowed to what a build needs. */
type Runner = (bin: string, args: string[], cwd: string) => Promise<RunOutcome>;

/** What a configure-and-build produced, as lines to print and the row's exit code. */
export interface BuildOutcome {
	/** The binary the generator was supposed to write, or null when it was not written. */
	program: string | null;
	/** The row's verdict for this outcome: 0 when it should skip, 1 when it should fail. */
	exit: number;
	/** What the row prints, in order, without its own log prefix. */
	lines: string[];
}

/** Configure `root` with `generator`, build the `Debug` configuration, and find the artefact. */
export async function buildProgram(options: {
	cmake: string;
	root: string;
	generator: string;
	run: Runner;
}): Promise<BuildOutcome> {
	const { cmake, root, generator, run } = options;
	const build = join(root, "build");
	const program = programPath(build);

	const args = configureArgs(root, build, generator);
	const configured = await run(cmake, args, root);
	if (configured.spawn !== null) {
		return failed(`could not spawn ${cmake}: ${configured.spawn}`);
	}
	if (configured.code !== 0) {
		// A generator listed but not installed names an environment gap, never a quarry defect.
		if (toolsetMissing(configured.stderr)) return skipped(NO_TOOLSET);
		return failed(`configure: cmake ${args.join(" ")}`, "stderr", configured.stderr);
	}

	const buildArgs = ["--build", build, "--config", CONFIGURATION];
	const built = await run(cmake, buildArgs, root);
	if (built.code !== 0) {
		const output = `${built.stdout}\n${built.stderr}`;
		return failed(`build: cmake ${buildArgs.join(" ")}`, "output", output);
	}
	if (!existsSync(program)) {
		return {
			program: null,
			exit: 1,
			lines: [
				`FAIL  the ${CONFIGURATION} build wrote no ${program}`,
				`directory  ${artifactList(build)}`,
			],
		};
	}
	return { program, exit: 0, lines: [] };
}

/** A failure with the first lines of what the command said. */
function failed(headline: string, label = "", output = ""): BuildOutcome {
	const lines = [`FAIL  ${headline}`];
	for (const line of errorLines(output)) lines.push(`${label}  ${line}`);
	return { program: null, exit: 1, lines };
}

/** A skip: a machine gap the row cannot measure through, never a verdict on the product. */
function skipped(reason: string): BuildOutcome {
	return { program: null, exit: 0, lines: [`SKIP  ${reason}`] };
}
