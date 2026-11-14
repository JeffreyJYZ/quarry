/**
 * One row that borrows the project's own build, in the order the report reads: the fixture's build
 * and its expectations, the plan a session would make, the analysis, the build Run would run, then
 * the target list and the trees.
 *
 * Every step is its own module, because each judges a different consumer and each has its own
 * reason for failing; this file is only the order they run in.
 */

import type { Fixture } from "../fixtures/types";
import { writeFixture } from "../project";
import type { Row } from "../types";
import { analyseProject } from "./row-analysis";
import { buildProject } from "./row-build";
import { expectationsHold, fixtureOwnBuild } from "./row-fixture";
import { openProject } from "./row-open";
import { judgeTargets, judgeTrees } from "./row-tree";

export async function judge(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "FAIL",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	const own = await fixtureOwnBuild(fixture, root, cmake, row);
	broken = own.broken;
	broken = await expectationsHold(
		fixture,
		root,
		clangd,
		own.userDb,
		own.userDbExists,
		row,
		broken,
	);
	const opened = await openProject(plannerBin, root, own.userDb, row, findings);

	row.analysis = await analyseProject(
		fixture,
		root,
		clangd,
		opened.plan,
		own.userDb,
		own.userDbExists,
		row,
		findings,
		broken,
	);

	const built = await buildProject(fixture, root, plannerBin, cmake, row, findings);
	row.build = built.build;
	row.targets = await judgeTargets(plannerBin, root, opened.target, built.section, row, findings);
	judgeTrees(root, opened.plan, opened.madeBuildTreeBefore, row, findings);
	return { row, findings, broken };
}
