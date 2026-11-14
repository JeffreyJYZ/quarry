#!/usr/bin/env bun
/**
 * What a Windows debugger row needs before it speaks DAP: a process runner, the skip reasons, and
 * the path comparisons a Windows runner needs.
 *
 * Finding the adapter is its own module (`windows-debug-adapter.ts`), because finding one and
 * starting one are different questions: this file only has to run a command and compare paths.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./cpp-parity/types";
import { NO_TOOLSET, NO_VS } from "./cpp-parity/windows";
import { spawnArgs, type Way } from "./windows-debug-launch";

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

/** The entries of the `PATH` a child would inherit, split the way the platform splits it. */
export function pathEntries(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
): string[] {
	const value = environment.PATH ?? environment.Path ?? "";
	const separator = platform === "win32" ? ";" : ":";
	return value.split(separator).filter((entry) => entry !== "");
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
/** What one command produced, plus the reason it could not be created at all. */
export interface RunOutcome extends RunResult {
	/** Why the process could not be created, when the OS refused it outright. */
	spawn: string | null;
}

/**
 * Run one command to completion and keep both streams, which every failure reports verbatim.
 *
 * A process the OS refuses to create is data, not an exception: on Windows `CreateProcess` answers
 * `ERROR_MOD_NOT_FOUND` for a program whose DLL is missing and libuv surfaces it as `EUNKNOWN`, and
 * the row that finds one candidate like that must still be able to try the next. The first run of
 * the probe died exactly there — `uv_spawn` thrown out of `chooseAdapter` and out of the row.
 */
export async function run(
	bin: string,
	args: string[],
	cwd: string,
	timeout = 180_000,
	way: Way = "direct",
): Promise<RunOutcome> {
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn(spawnArgs(way, bin, args), {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		return { code: null, stdout: "", stderr: "", spawn: messageOf(error) };
	}

	const stdout = new Response(child.stdout as ReadableStream).text();
	const stderr = new Response(child.stderr as ReadableStream).text();
	const timer = setTimeout(() => child.kill(), timeout);
	try {
		const code = await child.exited;
		clearTimeout(timer);
		return { code, stdout: await stdout, stderr: await stderr, spawn: null };
	} catch (error) {
		clearTimeout(timer);
		return { code: null, stdout: "", stderr: "", spawn: messageOf(error) };
	}
}

/** An error as one line, whichever shape it arrives in. */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
