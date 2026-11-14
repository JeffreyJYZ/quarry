/**
 * The profile row: the plan names a configuration, CMake receives it, the compile command carries
 * the debug info the profile promises, and a session start reads the tree that build wrote.
 */

import { basename, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import { cacheBuildType, compileArguments, profileFlags } from "../database";
import { commandLine, describeFlags } from "../format";
import { relativeTo } from "../paths";
import { askPlan } from "../plan";
import { writeFixture } from "../project";
import type { Plan, Row } from "../types";
import { judgeProfileSwitch } from "./profile-switch";
import { runBuild } from "../build";

/**
 * One profile row: the plan names it, CMake receives it, and the compile command carries the debug
 * info `RelWithDebInfo` promises while `MinSizeRel` produces none.
 *
 * Both halves run into the same tree, so the second configure is also the proof that a profile
 * change reconfigures the project instead of reusing the previous flags.
 *
 * The session is then started the way the window starts it — `quarry-plan --profile` is the seam
 * `start_lsp` hands the profile through — so the analysis half proves the hand-off reads the tree
 * the build wrote: its cache keeps the profile's configuration, its database carries the profile's
 * own optimization and debug info, and switching the profile back reconfigures once and says so.
 */
export async function judgeProfile(
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
		analysis: "FAIL",
		targets: "n/a",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;
	let passed = true;
	let analysed = true;
	let buildRoot: string | null = null;
	const halves = [
		{
			profile: "relwithdebinfo",
			configuration: "RelWithDebInfo",
			optimisation: "-O2",
			debugInfo: true,
		},
		{
			profile: "minsizerel",
			configuration: "MinSizeRel",
			optimisation: "-Os",
			debugInfo: false,
		},
	];
	for (const half of halves) {
		let plan: Plan;
		try {
			plan = await askPlan(plannerBin, root, { profile: half.profile });
		} catch (error) {
			passed = false;
			const message = error instanceof Error ? error.message : String(error);
			row.details.push(`profile      FAIL  ${half.profile}: ${message}`);
			findings.push(
				`${directory}: the product cannot be asked for ${half.configuration} — \`cd ${directory} && quarry-plan . --profile ${half.profile}\` answers: ${message}`,
			);
			break;
		}
		const section = plan.cmake;
		if (!section) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: the product reports no CMake plan`);
			break;
		}
		buildRoot = section.buildRoot;
		const wanted = `-DCMAKE_BUILD_TYPE=${half.configuration}`;
		const named =
			section.configure.includes(wanted) && section.build.includes(half.configuration);
		row.details.push(
			`profile      ${named ? "PASS" : "FAIL"}  ${half.profile}: configure ${section.configure.includes(wanted) ? "names" : "omits"} ${wanted}, build ${section.build.includes(half.configuration) ? "names" : "omits"} ${half.configuration}`,
		);
		if (!named) {
			passed = false;
			findings.push(
				`${directory}: the ${half.profile} plan does not ask CMake for ${half.configuration} — \`cd ${directory} && quarry-plan . --profile ${half.profile}\` reports ${commandLine(root, section.build)}.`,
			);
		}
		const ran = await runBuild(root, section, directory, cmake, row);
		if (!ran.ok) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: ${ran.reason}`);
			break;
		}
		const database = join(section.buildRoot, "compile_commands.json");
		const args = compileArguments(database, "main.cpp");
		if (args === null) {
			broken = true;
			row.details.push(
				`fixture FAIL  ${half.profile}: the build wrote no compile command for main.cpp in ${relativeTo(root, database)}`,
			);
			break;
		}
		const carries = profileFlags(args, half);
		row.details.push(
			`profile      ${carries ? "PASS" : "FAIL"}  ${half.profile}: the compile command carries ${describeFlags(args)}, ${half.debugInfo ? "with" : "without"} -g`,
		);
		if (!carries) {
			passed = false;
			findings.push(
				`${directory}: ${half.configuration} must compile with ${half.optimisation} and ${half.debugInfo ? "with" : "without"} -g, but the compile command carries ${describeFlags(args)} — \`cd ${directory} && rg -- ${half.optimisation} ${relativeTo(root, database)}\`.`,
			);
		}

		// The session start for this profile: the hand-off must read the tree the build wrote, and
		// that tree must still describe the profile this build compiled with.
		const opened = await askPlan(plannerBin, root, { profile: half.profile });
		const tree = opened.handoff?.databaseDir ?? null;
		const openArgs =
			tree === null
				? null
				: compileArguments(join(tree, "compile_commands.json"), "main.cpp");
		const configured = tree === null ? null : cacheBuildType(tree);
		const followed =
			tree === section.buildRoot &&
			configured === half.configuration &&
			openArgs !== null &&
			profileFlags(openArgs, half);
		row.commands.push({
			line: `cd ${directory} && quarry-plan . --profile ${half.profile}`,
			verdict: followed ? "PASS" : "FAIL",
		});
		row.details.push(
			`analysis     ${followed ? "PASS" : "FAIL"}  ${half.profile}: the hand-off names ${tree === null ? "no database" : relativeTo(root, tree)} configured for ${configured ?? "nothing"} and carries ${describeFlags(openArgs)}`,
		);
		if (!followed) {
			analysed = false;
			findings.push(
				`${directory}: a ${half.profile} session must analyse the tree the ${half.configuration} build wrote, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${tree === null ? "no compile database" : relativeTo(root, tree)}, whose CMAKE_BUILD_TYPE is ${configured ?? "unset"} and whose main.cpp entry carries ${describeFlags(openArgs)}.`,
			);
		}
	}

	// Switching the profile in settings must make the next session follow it.
	if (!broken && buildRoot !== null) {
		const switched = await judgeProfileSwitch(plannerBin, root, buildRoot, row, findings);
		analysed = analysed && switched.analysed;
	}
	row.build = passed ? "PASS" : "FAIL";
	row.analysis = analysed ? "PASS" : "FAIL";
	return { row, findings, broken };
}
