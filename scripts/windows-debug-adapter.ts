#!/usr/bin/env bun
/**
 * Whether one `lldb-dap` can start, asked two ways, with every answer kept.
 *
 * The two questions are separate on purpose: whether a file exists, and whether a process from it
 * survives being launched. A row that only asks the first reports "adapter found" for a debugger that
 * never ran — which is what the first two Windows runs did, one as a silent `exit 53` and one as a
 * `uv_spawn` failure that ended the row. A process the OS refuses to create is therefore a fact
 * about one candidate, never an exception: the point of the walk is to reach the next one.
 */

import { readdirSync } from "node:fs";
import type { RunOutcome } from "./windows-debug-toolchain";
import { directoryOf, type Candidate } from "./windows-debug-candidates";

/** One launch of a candidate, asked to say what it is rather than to speak DAP. */
export interface Attempt {
	/** Where the launch was started from: the row's own directory, or the adapter's. */
	cwd: string;
	args: string[];
	exit: number | null;
	stdout: string;
	stderr: string;
	/** Why the process could not be created at all, when it could not be. */
	spawn: string | null;
}

/** What probing one candidate found. */
export interface Probe {
	candidate: Candidate;
	attempts: Attempt[];
	/** True when the process started and answered: it printed something, or it exited cleanly. */
	runs: boolean;
	/** Interesting entries beside it: the adapter itself, its loader, and how many other DLLs. */
	neighbours: string[];
	/** The directory listing, so an unreadable or empty folder is visible rather than implied. */
	directory: string;
}

type Runner = (bin: string, args: string[], cwd: string) => Promise<RunOutcome>;

/**
 * Ask one candidate what it is, from two directories.
 *
 * `--version` from the row's own cwd and again from the adapter's own directory: a program that
 * loads a library beside itself can answer only one of those, and which one is the whole difference
 * between "the install is unusable" and "the launch directory is wrong".
 */
export async function probeAdapter(candidate: Candidate, run: Runner): Promise<Probe> {
	const attempts: Attempt[] = [];
	for (const cwd of [process.cwd(), directoryOf(candidate.path)]) {
		for (const args of [["--version"], ["-h"]]) {
			const attempt = await attemptLaunch(run, candidate, cwd, args);
			attempts.push(attempt);
			if (answered(attempt)) return { ...describe(candidate), attempts, runs: true };
			// The file could not be created at all; asking it a second question from the same
			// directory would repeat the same answer.
			if (attempt.spawn !== null) break;
		}
	}
	return { ...describe(candidate), attempts, runs: false };
}

/** One launch, with a failure to create the process kept as data rather than thrown. */
async function attemptLaunch(
	run: Runner,
	candidate: Candidate,
	cwd: string,
	args: string[],
): Promise<Attempt> {
	const empty = { cwd, args, exit: null, stdout: "", stderr: "" };
	try {
		const result = await run(candidate.path, args, cwd);
		return {
			...empty,
			spawn: result.spawn,
			exit: result.code,
			stdout: result.stdout.trim(),
			stderr: result.stderr.trim(),
		};
	} catch (error) {
		return { ...empty, spawn: error instanceof Error ? error.message : String(error) };
	}
}

/** Whether one launch answered at all: clean exit, or any output on either stream. */
function answered(attempt: Attempt): boolean {
	if (attempt.spawn !== null) return false;
	return attempt.exit === 0 || attempt.stdout !== "" || attempt.stderr !== "";
}

/** The listing half of a probe: what is beside the binary, and what the folder holds. */
function describe(candidate: Candidate): Pick<Probe, "candidate" | "neighbours" | "directory"> {
	const directory = directoryOf(candidate.path);
	let entries: string[];
	try {
		entries = readdirSync(directory);
	} catch {
		return { candidate, neighbours: [], directory: `${directory} could not be read` };
	}
	const interesting = entries.filter((entry) => /^(lldb-dap|liblldb)/i.test(entry)).sort();
	const dlls = entries.filter((entry) => entry.toLowerCase().endsWith(".dll")).length;
	const named = dlls > interesting.length ? `${dlls} .dll in all` : null;
	return {
		candidate,
		neighbours: named === null ? interesting : [...interesting, named],
		directory: `${directory} holds ${summarise(entries)}`,
	};
}

/** One line from a directory listing: enough to see an empty or wrong folder at a glance. */
function summarise(entries: string[], limit = 8): string {
	if (entries.length === 0) return "nothing";
	const shown = entries.slice(0, limit).join(", ");
	return entries.length > limit ? `${shown}, … (${entries.length} entries)` : shown;
}
