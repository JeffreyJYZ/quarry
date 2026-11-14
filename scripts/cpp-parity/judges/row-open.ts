/**
 * Opening the project: the plan as a session makes it, and whether opening reconfigured the tree the
 * project's own build had already configured.
 */

import { statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isFile } from "../process";
import { askPlan } from "../plan";
import { relativeTo } from "../paths";
import type { Plan, Row } from "../types";

/** The plan a session would start from, and the witnesses the later steps read. */
export interface Opened {
	plan: Plan;
	target: Plan["targets"][number] | null;
	/** Whether `build/` held a cache before the product was asked, so a new one is the product's. */
	madeBuildTreeBefore: boolean;
}

/**
 * The plan as the project is opened: the target rows and the hand-off the session would make.
 *
 * A tree already configured by CLion must be found as it stands, so its cache timestamp is the
 * witness that opening did not reconfigure it.
 */
export async function openProject(
	plannerBin: string,
	root: string,
	userDb: string | null,
	row: Row,
	findings: string[],
): Promise<Opened> {
	const directory = basename(root);
	const fixtureCache = userDb === null ? null : join(dirname(userDb), "CMakeCache.txt");
	const cacheBefore =
		fixtureCache !== null && isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	const madeBuildTreeBefore = isFile(join(root, "build", "CMakeCache.txt"));
	const opened = await askPlan(plannerBin, root);
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: opened.cmake || opened.plain ? "PASS" : "FAIL",
	});
	const openedTarget = opened.targets[0] ?? null;
	const cacheAfter =
		fixtureCache !== null && isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	if (cacheBefore !== null && cacheAfter !== cacheBefore && fixtureCache !== null) {
		row.details.push("handoff      FAIL  opening re-configured the project's own tree");
		findings.push(
			`${directory}: opening the project re-configured ${relativeTo(root, dirname(fixtureCache))}, though its compile_commands.json was current — \`cd ${directory} && ls -l --time-style=full-iso ${relativeTo(root, fixtureCache)}\` changes across \`quarry-plan .\`.`,
		);
	}
	return { plan: opened, target: openedTarget, madeBuildTreeBefore };
}
