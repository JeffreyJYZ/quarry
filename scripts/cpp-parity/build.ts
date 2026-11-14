/**
 * Running a plan's build exactly as it was reported, and the commands a plain build is made of.
 *
 * Every row that judges a build runs this and nothing else, so the argv in the report is the argv
 * that made the tree, not a copy of it.
 */

import { CMAKE_TIMEOUT } from "./constants";
import { commandLine, firstError } from "./format";
import { run } from "./process";
import type { CmakeSection, PlainCommand, PlainSection, Row } from "./types";

/** The commands a plain plan reports, whichever shape the planner printed. */
export function plainCommands(section: PlainSection): PlainCommand[] {
	if (Array.isArray(section.commands)) return section.commands;
	if (!Array.isArray(section.argv)) return [];
	return [{ program: section.program ?? null, argv: section.argv, cwd: section.cwd ?? "." }];
}

/**
 * One plan's build, run exactly as it was reported: configure, then build.
 */
export async function runBuild(
	root: string,
	section: CmakeSection,
	directory: string,
	cmake: string,
	row: Row,
): Promise<{ ok: boolean; reason: string }> {
	const program = section.program ?? cmake;
	const configure = await run(program, section.configure.slice(1), section.cwd, CMAKE_TIMEOUT);
	row.commands.push({
		line: `cd ${directory} && ${commandLine(root, section.configure)}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	if (configure.code !== 0) {
		return {
			ok: false,
			reason: `configure exited ${configure.code}: ${firstError(configure.stderr)}`,
		};
	}
	const built = await run(program, section.build.slice(1), section.cwd, CMAKE_TIMEOUT);
	row.commands.push({
		line: `cd ${directory} && ${commandLine(root, section.build)}`,
		verdict: built.code === 0 ? "PASS" : "FAIL",
	});
	if (built.code !== 0) {
		return { ok: false, reason: `build exited ${built.code}: ${firstError(built.stderr)}` };
	}
	return { ok: true, reason: "" };
}

/**
 * A plain project's build, run exactly as it was reported: every command in order, in its own cwd.
 *
 * A mixed C/C++ project needs more than one compiler, so the plan reports a sequence: one command
 * per compiler for the sources, then the link that joins them. The first failing command stops it.
 */
export async function runPlainBuild(
	root: string,
	section: PlainSection,
	directory: string,
	row: Row,
): Promise<{ ok: boolean; reason: string }> {
	for (const command of plainCommands(section)) {
		const program = command.program ?? command.argv[0];
		const result = await run(program, command.argv.slice(1), command.cwd, CMAKE_TIMEOUT);
		const line = `cd ${directory} && ${commandLine(root, command.argv)}`;
		row.commands.push({ line, verdict: result.code === 0 ? "PASS" : "FAIL" });
		if (result.code !== 0) {
			const reason = `\`${line}\` exits ${result.code}: "${firstError(result.stderr)}"`;
			return { ok: false, reason };
		}
	}
	return { ok: true, reason: "" };
}
