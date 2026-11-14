#!/usr/bin/env bun
/**
 * What a Windows debugger row needs before it speaks DAP: the adapter the image installed, a process
 * runner, and the path comparison a Windows runner needs.
 *
 * `lldb-dap` is not one install. LLVM ships `lldb-dap.exe` in its `bin`, and Visual Studio ships the
 * same tool inside `VC\Tools\Llvm\<arch>\bin`; neither is guaranteed on `PATH` for a GUI launch, and
 * a name without `.exe` names nothing at all there. So the search walks `PATH` first — the same
 * order the product's resolver uses — and then the directories an installer writes into.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./cpp-parity/types";
import { NO_TOOLSET, NO_VS } from "./cpp-parity/windows";

/** Why a machine with neither installer skips the row, in words that name the fix. */
export const NO_ADAPTER =
	"no lldb-dap found: install LLVM (it ships lldb-dap.exe) or the Visual Studio C++ LLVM tools";

/** Why a machine without cmake skips: the row configures a project before it debugs one. */
export const NO_CMAKE = "cmake is not on PATH";

/** Every reason the row may skip, decided in the order the work happens. */
export interface SkipInput {
	/** Whether cmake was found. */
	cmake: boolean;
	/** The Visual Studio generators `cmake --help` listed. */
	generators: string[];
	/** The generator that configured, or null when none did. */
	configured: string | null;
	/** The adapter that was found, or null when none was. */
	adapter: string | null;
}

/** The named reason this machine cannot run the row, or null when it can. */
export function skipReason(input: SkipInput): string | null {
	if (!input.cmake) return NO_CMAKE;
	if (input.generators.length === 0) return NO_VS;
	if (input.configured === null) return NO_TOOLSET;
	if (input.adapter === null) return NO_ADAPTER;
	return null;
}

/** The file names an adapter may carry on this platform; `.exe` is the whole difference. */
export function adapterNames(platform: string = process.platform): string[] {
	return platform === "win32" ? ["lldb-dap.exe"] : ["lldb-dap"];
}

/** The entries of the `PATH` a child would inherit, split the way the platform splits it. */
export function pathEntries(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
): string[] {
	const value = environment.PATH ?? environment.Path ?? "";
	const separator = platform === "win32" ? ";" : ":";
	return value.split(separator).filter((entry) => entry !== "");
}

/** Every directory `lldb-dap` ships in under a Windows program-files root. */
export function adapterDirectories(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
): string[] {
	if (platform !== "win32") return [];
	const directories: string[] = [];
	for (const root of [environment.ProgramFiles, environment["ProgramFiles(x86)"]]) {
		if (root === undefined || root === "") continue;
		directories.push(join(root, "LLVM", "bin"));
		directories.push(...visualStudioLlvmBins(root));
	}
	return directories;
}

/**
 * The LLVM bins Visual Studio installs, for every year and edition present.
 *
 * The image moves its Visual Studio version, so the year and edition are read from disk rather than
 * named: a hardcoded `2022\Community` is the same mistake the generator probe already fixed once.
 */
export function visualStudioLlvmBins(root: string): string[] {
	const studio = join(root, "Microsoft Visual Studio");
	const found: string[] = [];
	for (const year of subdirectories(studio)) {
		for (const edition of subdirectories(join(studio, year))) {
			const tools = join(studio, year, edition, "VC", "Tools", "Llvm");
			for (const architecture of subdirectories(tools)) {
				found.push(join(tools, architecture, "bin"));
			}
		}
	}
	return found;
}

/** The subdirectories of a directory; anything unreadable is no subdirectory at all. */
function subdirectories(directory: string): string[] {
	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

/** The first `lldb-dap` this machine has, searched the way the product searches for one. */
export function findAdapter(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
	isFile: (path: string) => boolean = existsSync,
): string | null {
	const directories = [
		...pathEntries(environment, platform),
		...adapterDirectories(environment, platform),
	];
	for (const directory of directories) {
		for (const name of adapterNames(platform)) {
			const candidate = join(directory, name);
			if (isFile(candidate)) return candidate;
		}
	}
	return null;
}

/** One path as DAP will compare it: no verbatim prefix, forward slashes, no case difference. */
export function normaliseSource(path: string): string {
	return path
		.replace(/^\\\\\?\\/, "")
		.replaceAll("\\", "/")
		.toLowerCase();
}

/** Whether two spellings name the same source file; a Windows stop reports the other one. */
export function sameSource(one: string, other: string): boolean {
	return normaliseSource(one) === normaliseSource(other);
}

/**
 * The spelling Windows' own canonicalisation adds, or null on a platform without one.
 *
 * `fs::canonicalize` answers with a verbatim path there (`\\?\C:\…`), and the project tree is opened
 * through it, so a breakpoint can arrive spelled that way while the debug info spells it without.
 * The row measures both; the product decides which one an adapter should see.
 */
export function verbatimPath(path: string, platform: string = process.platform): string | null {
	if (platform !== "win32") return null;
	if (/^[A-Za-z]:\\/.test(path)) return `\\\\?\\${path}`;
	if (path.startsWith("\\\\")) return `\\\\?\\UNC\\${path.slice(2)}`;
	return null;
}

/** Run one command to completion and keep both streams, which every failure reports verbatim. */
export function run(
	bin: string,
	args: string[],
	cwd: string,
	timeout = 180_000,
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = Bun.spawn([bin, ...args], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = new Response(child.stdout as ReadableStream).text();
		const stderr = new Response(child.stderr as ReadableStream).text();
		const timer = setTimeout(() => child.kill(), timeout);
		void child.exited.then(async (code) => {
			clearTimeout(timer);
			resolve({ code, stdout: await stdout, stderr: await stderr });
		});
	});
}
