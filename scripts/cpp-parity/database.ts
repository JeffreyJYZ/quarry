/**
 * Reading what a build recorded: the compile command for one source, the flags a profile promises,
 * and the build type a tree's own cache names.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isFile } from "./process";

/**
 * The compile arguments CMake recorded for one source, from the database the plan's configure wrote.
 *
 * `arguments` is preferred where the generator writes it; a `command` string is split on whitespace,
 * which is enough to tell `-g` from its absence and is never used to judge a quoted path.
 */
export function compileArguments(database: string, source: string): string[] | null {
	if (!isFile(database)) return null;
	let entries: { file: string; arguments?: string[]; command?: string }[];
	try {
		entries = JSON.parse(readFileSync(database, "utf8"));
	} catch {
		return null;
	}
	const entry = entries.find((candidate) => basename(candidate.file) === source);
	if (entry === undefined) return null;
	if (Array.isArray(entry.arguments)) return entry.arguments;
	return entry.command === undefined ? null : entry.command.split(/\s+/);
}

/** One profile's expectation: the configuration CMake names, its optimisation and its debug info. */
export interface ProfileHalf {
	profile: string;
	configuration: string;
	optimisation: string;
	debugInfo: boolean;
}

/** Whether a compile command carries the optimisation and the debug info a profile promises. */
export function profileFlags(args: string[], half: ProfileHalf): boolean {
	return args.includes(half.optimisation) && args.includes("-g") === half.debugInfo;
}

/** `CMAKE_BUILD_TYPE` from a tree's own cache, or null when it has no cache to read. */
export function cacheBuildType(tree: string): string | null {
	const file = join(tree, "CMakeCache.txt");
	if (!isFile(file)) return null;
	const line = readFileSync(file, "utf8")
		.split("\n")
		.find((row) => row.startsWith("CMAKE_BUILD_TYPE:"));
	return line === undefined ? "" : (line.split("=")[1] ?? "").trim();
}
