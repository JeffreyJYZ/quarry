/**
 * The GCC rows' machinery: the probe's own plan asker, process runner and clangd session, so the
 * row measures the product instead of re-implementing either.
 */

import { analyse } from "./analysis";
import { compileArguments } from "./database";
import type { Fixture } from "./fixtures/types";
import { commandLine, firstError } from "./format";
import type { GccHarness } from "./gcc";
import { askPlan } from "./plan";
import { isFile, run } from "./process";
import { writeFixture } from "./project";

export function gccHarness(
	root: string,
	fixture: Fixture,
	plannerBin: string,
	clangd: string,
): GccHarness {
	return {
		ask: (flags) => askPlan(plannerBin, root, flags),
		run,
		analyse: (probes, args) => analyse(clangd, root, probes, args),
		compileArguments,
		commandLine: (argv) => commandLine(root, argv),
		firstError,
		isFile,
		writeFixture: () => writeFixture(root, fixture),
		// macOS pairs clang with libc++ and GCC with libstdc++, so an unqueried clangd there
		// genuinely cannot answer; where both compilers share one standard library the control is
		// evidence, not a requirement.
		requiresDriverControl: process.platform === "darwin",
	};
}
