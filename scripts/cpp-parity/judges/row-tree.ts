/**
 * What the dropdown offers and what Run would launch, and the two tree verdicts: a second tree is
 * not a capability, and neither is a cache written into the source directory.
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { findExecutables, relativeTo } from "../paths";
import { askPlan } from "../plan";
import { isFile } from "../process";
import type { CmakeSection, Plan, Row, Verdict } from "../types";

/** The target list after the build: what the dropdown offers and what Run would launch. */
export async function judgeTargets(
	plannerBin: string,
	root: string,
	openedTarget: Plan["targets"][number] | null,
	section: CmakeSection | null,
	row: Row,
	findings: string[],
): Promise<Verdict> {
	const directory = basename(root);
	const relative = (path: string) => relativeTo(root, path);
	const after = await askPlan(plannerBin, root);
	const target = after.targets[0] ?? null;
	const program = target?.program ?? null;
	const exists = program !== null && isFile(program);
	row.commands.push({
		line: `cd ${directory} && ls -l ${program === null ? "(no target)" : relative(program)}`,
		verdict: exists ? "PASS" : "FAIL",
	});
	if (exists && target) {
		row.details.push(`targets      PASS  ${target.id} -> ${relative(program as string)}`);
	} else {
		const name = target?.target ?? section?.buildRoot.split("/").pop() ?? after.name;
		const written = findExecutables(root, name).map(relative);
		row.details.push(
			`targets      FAIL  ${target?.id ?? "no target"} -> ${program === null ? "no program" : relative(program)} does not exist; builds wrote ${JSON.stringify(written)}`,
		);
		findings.push(
			`${directory}: the target list offers ${target?.id ?? "nothing"} whose program ${program === null ? "is unset" : relative(program)} does not exist — \`cd ${directory} && ls -l ${program === null ? "." : relative(program)}\` fails while the builds wrote ${JSON.stringify(written)}.`,
		);
	}
	if (openedTarget && target && openedTarget.program !== target.program) {
		row.details.push(
			`targets      note  on open it named ${openedTarget.program === null ? "nothing" : relative(openedTarget.program)}; after the build it names ${target.program === null ? "nothing" : relative(target.program)}`,
		);
	}
	return exists ? "PASS" : "FAIL";
}

/**
 * A second tree is not a capability. The plan names the tree analysis reads, so a `build/` the
 * product configured only to have a database to hand clangd is a tree nobody wants: a project whose
 * plan names another directory must be analysed from that directory.
 */
export function judgeTrees(
	root: string,
	openedPlan: Plan,
	madeBuildTreeBefore: boolean,
	row: Row,
	findings: string[],
): void {
	const directory = basename(root);
	const relative = (path: string) => relativeTo(root, path);
	const planTree = openedPlan.cmake?.buildRoot ?? null;
	const fallbackTree = join(root, "build");
	if (
		!madeBuildTreeBefore &&
		isFile(join(fallbackTree, "CMakeCache.txt")) &&
		planTree !== fallbackTree
	) {
		row.tree = "FAIL";
		row.details.push(
			`tree         FAIL  the hand-off configured ${relative(fallbackTree)} though the plan names ${planTree === null ? "no tree" : relative(planTree)}`,
		);
		findings.push(
			`${directory}: opening the project configured a second tree — ${relative(fallbackTree)} holds a CMakeCache.txt the fixture's own build never wrote, while the plan names ${planTree === null ? "no tree" : relative(planTree)}. \`cd ${directory} && ls build/CMakeCache.txt\`.`,
		);
	} else {
		row.details.push(
			`tree         PASS  no fallback tree; the plan names ${planTree === null ? "no tree" : relative(planTree)}`,
		);
	}

	// A build tree inside the source directory is a CLion deviation worth naming.
	if (existsSync(join(root, "CMakeCache.txt"))) {
		row.details.push(
			"tree         FAIL  a configure wrote CMakeCache.txt into the source directory",
		);
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`. CLion configures out of source.`,
		);
	}
}
