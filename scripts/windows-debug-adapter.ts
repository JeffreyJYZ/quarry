#!/usr/bin/env bun
/**
 * Which `lldb-dap` this machine has, which of them can start, and what a startup death said.
 *
 * Two questions, answered and printed separately: whether a file exists, and whether a process from
 * it survives being launched. A row that only asks the first reports "adapter found" for a debugger
 * that dies in 200 ms — which is what the first Windows run did: the binary was there, exited 53
 * before answering `initialize`, and the log carried neither the status nor a byte of stderr.
 *
 * The candidate list is the product resolver's own (`src-tauri/src/resolve/windows_llvm.rs`): the
 * `PATH` the shell has, then `%ProgramFiles%\LLVM\bin`, then the copy Visual Studio ships inside
 * itself. The row must not prefer a different adapter than the app would.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunResult } from "./cpp-parity/types";
import { pathEntries, visualStudioLlvmBins } from "./windows-debug-toolchain";

/** One place an adapter could be, and why it is on the list. */
export interface Candidate {
	path: string;
	source: string;
}

/** One launch of a candidate, asked to say what it is rather than to speak DAP. */
export interface Attempt {
	args: string[];
	exit: number | null;
	stdout: string;
	stderr: string;
}

/** What probing one candidate found. */
export interface Probe {
	candidate: Candidate;
	attempts: Attempt[];
	/** True when the process started and answered: it printed something, or it exited cleanly. */
	runs: boolean;
	/** The DLLs beside it, which is what a Windows loader needs before the exe runs at all. */
	libraries: string[];
}

type Runner = (bin: string, args: string[], cwd: string) => Promise<RunResult>;

/** The adapter's file name on this platform; `.exe` is the whole difference. */
export function adapterNames(platform: string = process.platform): string[] {
	return platform === "win32" ? ["lldb-dap.exe"] : ["lldb-dap"];
}

/** The DLL an `lldb-dap.exe` from LLVM loads before any of its own code runs. */
export const ADAPTER_LIBRARY = "liblldb.dll";

/**
 * Every adapter this machine could run, in the product resolver's order, each named by its source.
 *
 * `isFile` is a parameter so the order is testable without a Windows install: the order is the part
 * that must agree with the product, not the disk.
 */
export function adapterCandidates(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
	isFile: (path: string) => boolean = existsSync,
): Candidate[] {
	const directories = [
		...pathEntries(environment, platform).map((path) => ({ path, source: "PATH" })),
		...windowsDirectories(environment, platform),
	];
	const candidates: Candidate[] = [];
	for (const directory of directories) {
		for (const name of adapterNames(platform)) {
			const path = join(directory.path, name);
			if (isFile(path)) candidates.push({ path, source: directory.source });
		}
	}
	return candidates;
}

/** The directories the product resolver falls back to on Windows, in its own order. */
export function windowsDirectories(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
): { path: string; source: string }[] {
	if (platform !== "win32") return [];
	const found: { path: string; source: string }[] = [];
	const roots = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] as const;
	for (const variable of roots) {
		const root = environment[variable];
		if (root === undefined || root === "") continue;
		found.push({ path: join(root, "LLVM", "bin"), source: `%${variable}%\\LLVM\\bin` });
	}
	const home = environment.USERPROFILE;
	if (home !== undefined && home !== "") {
		found.push({ path: join(home, ".cargo", "bin"), source: "%USERPROFILE%\\.cargo\\bin" });
		found.push({ path: join(home, ".local", "bin"), source: "%USERPROFILE%\\.local\\bin" });
	}
	const local = environment.LOCALAPPDATA;
	if (local !== undefined && local !== "") {
		found.push({
			path: join(local, "Programs", "LLVM", "bin"),
			source: "%LOCALAPPDATA%\\Programs\\LLVM\\bin",
		});
	}
	for (const root of [environment.ProgramFiles, environment.ProgramW6432]) {
		if (root === undefined || root === "") continue;
		for (const bin of visualStudioLlvmBins(root)) {
			found.push({ path: bin, source: "Visual Studio's LLVM" });
		}
	}
	return found;
}

/** Ask one candidate what it is; a process that cannot load never answers either question. */
export async function probeAdapter(candidate: Candidate, run: Runner): Promise<Probe> {
	const attempts: Attempt[] = [];
	for (const args of [["--version"], ["-h"]]) {
		const result = await run(candidate.path, args, dirname(candidate.path));
		attempts.push({
			args,
			exit: result.code,
			stdout: result.stdout.trim(),
			stderr: result.stderr.trim(),
		});
		if (answered(attempts[attempts.length - 1])) break;
	}
	return {
		candidate,
		attempts,
		runs: attempts.some(answered),
		libraries: libraryNeighbours(candidate.path),
	};
}

/** Whether one launch answered at all: clean exit, or any output on either stream. */
function answered(attempt: Attempt): boolean {
	return attempt.exit === 0 || attempt.stdout !== "" || attempt.stderr !== "";
}

/** The first candidate that starts, with every probe kept so the log shows what was rejected. */
export async function chooseAdapter(
	candidates: Candidate[],
	run: Runner,
): Promise<{ chosen: Candidate | null; probes: Probe[] }> {
	const probes: Probe[] = [];
	for (const candidate of candidates) {
		const probe = await probeAdapter(candidate, run);
		probes.push(probe);
		if (probe.runs) return { chosen: candidate, probes };
	}
	return { chosen: null, probes };
}

/** The DLLs beside an adapter, since a loader failure names none of them itself. */
export function libraryNeighbours(path: string): string[] {
	try {
		return readdirSync(dirname(path)).filter((entry) => entry.toLowerCase().endsWith(".dll"));
	} catch {
		return [];
	}
}

/** The Windows loader statuses worth naming, as unsigned words. */
const LOADER_STATUSES: [number, string][] = [
	[0xc0000135, "the loader could not find a DLL beside it"],
	[0xc0000139, "a DLL beside it is not the version it was linked against"],
	[0xc0000142, "a DLL beside it failed to initialise"],
	[0xc0000005, "it crashed before it could answer"],
];

/** An exit code as a number and a hex word, with the loader's reason when it is one. */
export function describeExit(code: number | null): string {
	if (code === null) return "no exit status";
	const unsigned = code < 0 ? code + 2 ** 32 : code;
	const named = LOADER_STATUSES.find(([value]) => value === unsigned);
	const hex = `0x${unsigned.toString(16)}`;
	return named === undefined ? `${code} (${hex})` : `${code} (${hex}: ${named[1]})`;
}

/** A probe as log lines: what was asked, how each ended, what it said, and what sits beside it. */
export function describeProbe(probe: Probe): string[] {
	const status = probe.attempts
		.map((attempt) => `${attempt.args.join(" ")}: ${describeExit(attempt.exit)}`)
		.join(", ");
	const said = oneLine(
		probe.attempts.flatMap((attempt) => [attempt.stdout, attempt.stderr]).join(" "),
	);
	return [
		`${probe.runs ? "starts" : "dies"}  ${probe.candidate.path}  (${probe.candidate.source})  ` +
			`${status}${said === "" ? "" : `  said: ${said}`}`,
		`beside it: ${probe.libraries.length === 0 ? "no .dll" : probe.libraries.join(", ")}`,
	];
}

/** One log line from arbitrary output: newlines gone, long output clipped. */
export function oneLine(text: string, limit = 200): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}
