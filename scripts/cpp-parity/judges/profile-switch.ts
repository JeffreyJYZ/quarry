/**
 * Switching the profile in settings must make the next session follow it: the profile loop leaves
 * the tree as MinSizeRel, so a RelWithDebInfo start is a genuine reconfigure — once, and said once.
 */

import { statSync } from "node:fs";
import { basename, join } from "node:path";
import { compileArguments, cacheBuildType, profileFlags } from "../database";
import { describeFlags } from "../format";
import { relativeTo } from "../paths";
import { askPlan } from "../plan";
import type { Row } from "../types";

export async function judgeProfileSwitch(
	plannerBin: string,
	root: string,
	buildRoot: string,
	row: Row,
	findings: string[],
): Promise<{ analysed: boolean }> {
	const directory = basename(root);
	let analysed = true;
	const cache = join(buildRoot, "CMakeCache.txt");
	const switched = await askPlan(plannerBin, root, { profile: "relwithdebinfo" });
	const tree = switched.handoff?.databaseDir ?? null;
	const switchedArgs =
		tree === null ? null : compileArguments(join(tree, "compile_commands.json"), "main.cpp");
	const switchedType = tree === null ? null : cacheBuildType(tree);
	const followed =
		switchedType === "RelWithDebInfo" &&
		switchedArgs !== null &&
		profileFlags(switchedArgs, {
			profile: "relwithdebinfo",
			configuration: "RelWithDebInfo",
			optimisation: "-O2",
			debugInfo: true,
		}) &&
		(switched.handoff?.note ?? "") !== "";
	row.commands.push({
		line: `cd ${directory} && quarry-plan . --profile relwithdebinfo`,
		verdict: followed ? "PASS" : "FAIL",
	});
	row.details.push(
		`analysis     ${followed ? "PASS" : "FAIL"}  switching to relwithdebinfo: the tree is ${switchedType ?? "unconfigured"}, the database carries ${describeFlags(switchedArgs)}, and the start ${switched.handoff?.note ? `says ${JSON.stringify(switched.handoff.note)}` : "says nothing"}`,
	);
	if (!followed) {
		analysed = false;
		findings.push(
			`${directory}: switching the profile to relwithdebinfo must reconfigure the tree it analyses and report that once, but \`cd ${directory} && quarry-plan . --profile relwithdebinfo\` leaves ${relativeTo(root, cache)} at ${switchedType ?? "unset"}, names a database carrying ${describeFlags(switchedArgs)}, and ${switched.handoff?.note ? "noted it" : "said nothing"}.`,
		);
	}

	const stable = statSync(cache).mtimeMs;
	const settled = await askPlan(plannerBin, root, { profile: "relwithdebinfo" });
	const quiet = (settled.handoff?.note ?? "") === "" && statSync(cache).mtimeMs === stable;
	row.details.push(
		`analysis     ${quiet ? "PASS" : "FAIL"}  a second start with the same profile ${quiet ? "does not configure again" : "reconfigured the tree again"}`,
	);
	if (!quiet) {
		analysed = false;
		findings.push(
			`${directory}: a second start with the profile unchanged must not configure again, but ${relativeTo(root, cache)} changed or the start reported a reconfigure.`,
		);
	}
	return { analysed };
}
