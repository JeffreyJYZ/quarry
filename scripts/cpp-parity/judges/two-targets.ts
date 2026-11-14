/**
 * One target row: asking for one executable builds it and not its sibling, and asking for nothing
 * builds both.
 */

import { basename } from "node:path";
import type { Fixture } from "../fixtures/types";
import { runBuild } from "../build";
import { commandLine } from "../format";
import { wroteExecutable } from "../paths";
import { askPlan } from "../plan";
import { writeFixture } from "../project";
import type { Plan, Row } from "../types";

/**
 * The artefacts are checked, not the argv: a build that names a target and still writes everything
 * would pass an argv-only test and fail the user whose second executable takes ten minutes.
 */
export async function judgeOneTarget(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "n/a",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	let one: Plan;
	try {
		one = await askPlan(plannerBin, root, { target: "cpp:parity_one" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.details.push(
			`target       FAIL  the product cannot be asked for one target: ${message}`,
		);
		findings.push(
			`${directory}: the product cannot be asked to build one target — \`cd ${directory} && quarry-plan . --target cpp:parity_one\` answers: ${message}`,
		);
		one = await askPlan(plannerBin, root);
	}
	const section = one.cmake;
	if (!section) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no CMake plan");
		return { row, findings, broken };
	}
	const named = section.build.join(" ").includes("--target parity_one");
	row.details.push(
		`target       ${named ? "PASS" : "FAIL"}  the plan names one target: ${commandLine(root, section.build)}`,
	);
	const first = await runBuild(root, section, directory, cmake, row);
	if (!first.ok) {
		broken = true;
		row.details.push(`fixture FAIL  one-target build: ${first.reason}`);
		return { row, findings, broken };
	}
	const builtOne = wroteExecutable(root, "parity_one");
	const builtTwo = wroteExecutable(root, "parity_two");
	row.commands.push({
		line: `cd ${directory} && ls -l build/parity_one build/parity_two`,
		verdict: builtOne && !builtTwo ? "PASS" : "FAIL",
	});
	row.details.push(
		`build        ${builtOne && !builtTwo ? "PASS" : "FAIL"}  after --target parity_one: parity_one ${builtOne ? "written" : "missing"}, parity_two ${builtTwo ? "written" : "missing"}`,
	);
	row.build = named && builtOne && !builtTwo ? "PASS" : "FAIL";
	if (row.build === "FAIL") {
		findings.push(
			`${directory}: asking for parity_one ${builtTwo ? "also built parity_two" : builtOne ? "did not build parity_one" : "built nothing"} — \`cd ${directory} && ${commandLine(root, section.build)}\` ${section.build.includes("--target") ? "does name a target" : "names no target, so cmake builds every target in the tree"}.`,
		);
	}

	const all = await askPlan(plannerBin, root);
	const everything = all.cmake;
	if (!everything) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no CMake plan without a target");
		return { row, findings, broken };
	}
	const second = await runBuild(root, everything, directory, cmake, row);
	if (!second.ok) {
		broken = true;
		row.details.push(`fixture FAIL  whole-tree build: ${second.reason}`);
		return { row, findings, broken };
	}
	const bothOne = wroteExecutable(root, "parity_one");
	const bothTwo = wroteExecutable(root, "parity_two");
	row.commands.push({
		line: `cd ${directory} && ls -l build/parity_one build/parity_two`,
		verdict: bothOne && bothTwo ? "PASS" : "FAIL",
	});
	row.details.push(
		`targets      ${bothOne && bothTwo ? "PASS" : "FAIL"}  after no --target: parity_one ${bothOne ? "written" : "missing"}, parity_two ${bothTwo ? "written" : "missing"}; the plan ${everything.target === null ? "names no target" : `still names ${everything.target}`}`,
	);
	row.targets = bothOne && bothTwo ? "PASS" : "FAIL";
	if (row.targets === "FAIL") {
		findings.push(
			`${directory}: a build with no target left parity_one ${bothOne ? "written" : "missing"} and parity_two ${bothTwo ? "written" : "missing"} — \`cd ${directory} && ${commandLine(root, everything.build)}\`.`,
		);
	}
	return { row, findings, broken };
}
