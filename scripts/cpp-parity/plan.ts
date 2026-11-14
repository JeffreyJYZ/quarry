/**
 * Asking the product what it would do, and running the build it reports.
 *
 * Everything here spawns `quarry-plan` — the example that prints `cmake_plan`, the same function
 * `run_cmake_build` calls — so a row judges the product's decisions rather than a copy of them.
 */

import { join, resolve as resolvePath } from "node:path";
import { CARGO_TIMEOUT } from "./constants";
import { firstError } from "./format";
import { isFile, run } from "./process";
import type { Plan } from "./types";

const MANIFEST = join(import.meta.dir, "..", "..", "src-tauri");

/**
 * Build `quarry-plan` once and return the executable cargo produced.
 *
 * `QUARRY_PLAN_BIN` skips the build so a caller can measure a planner built from another commit —
 * that is how the before/after in this task's report was taken, without editing the probe.
 *
 * The override is resolved against the probe's own working directory: an environment variable
 * arrives repo-relative, while every ask spawns the planner with a fixture as its cwd, so passing it
 * through unresolved answered `ENOENT` on Windows and left both Windows rows unmeasurable.
 */
export async function planner(): Promise<string> {
	const override = process.env.QUARRY_PLAN_BIN;
	if (override !== undefined && override !== "") {
		const resolved = resolvePath(override);
		if (!isFile(resolved)) throw new Error(`QUARRY_PLAN_BIN is not a file: ${resolved}`);
		return resolved;
	}
	const result = await run(
		"cargo",
		["build", "--example", "quarry-plan", "--message-format=json"],
		MANIFEST,
		CARGO_TIMEOUT,
	);
	for (const line of result.stdout.split("\n")) {
		if (!line.trim().startsWith("{")) continue;
		try {
			const message = JSON.parse(line);
			if (message.reason === "compiler-artifact" && message.target?.name === "quarry-plan") {
				if (typeof message.executable === "string" && isFile(message.executable)) {
					return message.executable;
				}
			}
		} catch {
			// cargo prints non-JSON lines too; the artifact line is the one this needs.
		}
	}
	throw new Error(`cargo never reported a quarry-plan executable: ${firstError(result.stderr)}`);
}

/** What one plan is asked for on the command line: a profile, and one target or everything. */
export interface PlanFlags {
	profile?: string;
	target?: string;
}

/** Ask the product what it would do with `root`, right now. */
export async function askPlan(binary: string, root: string, flags: PlanFlags = {}): Promise<Plan> {
	const args = [root];
	if (flags.profile !== undefined) args.push("--profile", flags.profile);
	if (flags.target !== undefined) args.push("--target", flags.target);
	const result = await run(binary, args, root);
	if (result.code !== 0)
		throw new Error(`quarry-plan ${args.join(" ")} failed: ${firstError(result.stderr)}`);
	return JSON.parse(result.stdout) as Plan;
}
