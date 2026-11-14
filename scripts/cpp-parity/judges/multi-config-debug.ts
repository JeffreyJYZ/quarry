/**
 * Debug info, read from the object each configuration compiled: the tool, not the flags.
 *
 * This linker keeps DWARF in the object, so the executable is identical either way and only the
 * object can tell the two configurations apart. The tool that reads it is the platform's —
 * `otool -l` on macOS, `readelf -S` for ELF — which is why the reader lives in
 * `cpp-parity-debug-info.ts`.
 */

import { basename } from "node:path";
import { findNamed, relativeTo } from "../paths";
import { readDebugInfo } from "../../cpp-parity-debug-info";
import { run } from "../process";
import type { Row } from "../types";

/** The configuration each build of a multi-config tree asks for, and what it must leave behind. */
export interface ConfigHalf {
	profile: string;
	configuration: string;
	debugInfo: boolean;
	/** The `PARITY_LEVEL` this configuration's flags define, which its analysis must read. */
	level: number;
}

export async function judgeMultiConfigDebugInfo(
	buildRoot: string,
	halves: ConfigHalf[],
	root: string,
	row: Row,
	findings: string[],
): Promise<{ passed: boolean; broken: boolean }> {
	const directory = basename(root);
	let passed = true;
	let broken = false;
	for (const half of halves) {
		const objects = findNamed(buildRoot, "main.cpp.o").filter((path) =>
			path.split("/").includes(half.configuration),
		);
		if (objects.length !== 1) {
			broken = true;
			row.details.push(
				`fixture FAIL  ${half.profile}: ${objects.length} main.cpp.o under ${relativeTo(root, buildRoot)} for ${half.configuration}`,
			);
			continue;
		}
		const object = objects[0] as string;
		const read = await readDebugInfo(
			object,
			relativeTo(root, object),
			process.platform,
			(bin, args) => run(bin, args, root),
		);
		const holds = read.dwarf === half.debugInfo;
		row.commands.push({
			line: `cd ${directory} && ${read.command}`,
			verdict: read.dwarf === null ? "SKIP" : holds ? "PASS" : "FAIL",
		});
		row.details.push(
			`debug info   ${read.dwarf === null ? "SKIP" : holds ? "PASS" : "FAIL"}  ${half.profile}: ${read.dwarf === null ? read.reason : `${relativeTo(root, object)} carries ${read.dwarf ? "debug info" : "no debug info"}`}`,
		);
		if (read.dwarf !== null && !holds) {
			passed = false;
			findings.push(
				`${directory}: ${half.configuration} must compile ${half.debugInfo ? "with" : "without"} debug info, but \`cd ${directory} && ${read.command}\` reads ${read.dwarf ? "a debug section" : "no debug section"}.`,
			);
		}
	}
	return { passed, broken };
}
