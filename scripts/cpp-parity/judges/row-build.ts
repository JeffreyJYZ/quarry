/**
 * The build half of a row that borrows a project's own build: a fresh plan, because the product
 * recomputes it when Build is pressed, then the argv it reports run exactly as reported.
 */

import { basename } from "node:path";
import type { Fixture } from "../fixtures/types";
import { plainCommands, runPlainBuild } from "../build";
import { CMAKE_TIMEOUT } from "../constants";
import { commandLine, firstError } from "../format";
import { relativeTo } from "../paths";
import { askPlan } from "../plan";
import { run } from "../process";
import type { CmakeSection, Row, Verdict } from "../types";

export async function buildProject(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
	row: Row,
	findings: string[],
): Promise<{ build: Verdict; section: CmakeSection | null }> {
	const directory = basename(root);
	const relative = (path: string) => relativeTo(root, path);
	const plain = fixture.kind === "plain";
	const buildPlan = await askPlan(plannerBin, root);
	const section = buildPlan.cmake;
	const plainSection = buildPlan.plain;
	let build: Verdict = "FAIL";
	if (plain) {
		if (!plainSection) {
			row.details.push("build        FAIL  the product reports no build for this project");
			findings.push(`${directory}: the product reports no build, so nothing would run.`);
		} else {
			const ran = await runPlainBuild(root, plainSection, directory, row);
			build = ran.ok ? "PASS" : "FAIL";
			if (!ran.ok) {
				row.details.push(`build        FAIL  the plain build ${ran.reason}`);
				findings.push(
					`${directory}: the plain build fails — ${ran.reason}${plainSection.note ? ` (it noted: ${plainSection.note})` : ""}.`,
				);
			} else {
				row.details.push(
					`build        PASS  ${plainCommands(plainSection).length} command(s) in ${plainCommands(plainSection)[0]?.cwd === root ? "." : relative(plainCommands(plainSection)[0]?.cwd ?? root)}`,
				);
			}
			if (plainSection.note) row.details.push(`note         ${plainSection.note}`);
		}
	} else if (!section) {
		row.details.push("build        FAIL  the product reports no CMake plan for this project");
		findings.push(`${directory}: the product reports no CMake plan, so no build can run.`);
	} else {
		const program = section.program ?? cmake;
		const configure = await run(
			program,
			section.configure.slice(1),
			section.cwd,
			CMAKE_TIMEOUT,
		);
		row.commands.push({
			line: `cd ${directory} && ${commandLine(root, section.configure)}`,
			verdict: configure.code === 0 ? "PASS" : "FAIL",
		});
		const built =
			configure.code === 0
				? await run(program, section.build.slice(1), section.cwd, CMAKE_TIMEOUT)
				: null;
		if (built) {
			row.commands.push({
				line: `cd ${directory} && ${commandLine(root, section.build)}`,
				verdict: built.code === 0 ? "PASS" : "FAIL",
			});
		}
		build = configure.code === 0 && built?.code === 0 ? "PASS" : "FAIL";
		if (build === "FAIL") {
			const failed = configure.code === 0 ? built : configure;
			const command = commandLine(
				root,
				configure.code === 0 ? section.build : section.configure,
			);
			const reason = firstError(failed?.stderr ?? "");
			row.details.push(`build        FAIL  ${command} exited ${failed?.code}: ${reason}`);
			findings.push(
				`${directory}: the build fails — \`cd ${directory} && ${command}\` exits ${failed?.code}: "${reason}". The plan chose ${relative(section.buildRoot)}${section.note ? ` and noted: ${section.note}` : ""}.`,
			);
		} else {
			row.details.push(
				`build        PASS  ${commandLine(root, section.configure)} in ${section.cwd === root ? "." : relative(section.cwd)}, tree ${relative(section.buildRoot)}`,
			);
		}
		if (section.note) row.details.push(`note         ${section.note}`);
	}
	return { build, section };
}
