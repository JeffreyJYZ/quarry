#!/usr/bin/env bun
/**
 * A probe as log lines: which adapters exist, which start through which route, and why the rest do not.
 *
 * One run of the row has to answer all of that, because a Windows runner is not a machine anyone can
 * log into. So a candidate prints its source, every route and directory it was asked from, the
 * status or spawn error of each question, what the process said, and what sits in its folder.
 */

import type { Attempt, Probe } from "./windows-debug-adapter";
import { describeExit } from "./windows-debug-exit";
import { describeWay } from "./windows-debug-launch";

/** A probe as log lines, indented by the caller. */
export function describeProbe(probe: Probe): string[] {
	const verdict = probe.runs ? `starts (${describeWay(probe.way ?? "direct")})` : "dies";
	const head = `${verdict}  ${probe.candidate.path}  (${probe.candidate.source})`;
	return [head, ...probe.attempts.map(attemptLine), `folder  ${probe.directory}`, beside(probe)];
}

/** How one launch ended: refused by the OS, exited with a status, or answered. */
function attemptLine(attempt: Attempt): string {
	const where = `${describeWay(attempt.way)} cwd ${attempt.cwd}`;
	if (attempt.spawn !== null) {
		return `  could not spawn  ${attempt.args.join(" ")}  ${where}  ${oneLine(attempt.spawn)}`;
	}
	const said = oneLine([attempt.stdout, attempt.stderr].join(" "));
	const status = `${attempt.args.join(" ")}  ${where}  ${describeExit(attempt.exit)}`;
	return `  ${status}${said === "" ? "" : `  said: ${said}`}`;
}

/** The adapter itself, its loader, and how many other DLLs share the folder. */
function beside(probe: Probe): string {
	const found = probe.neighbours.length === 0 ? "nothing named lldb-dap or liblldb" : "";
	return `  beside it  ${probe.neighbours.join(", ") || found}`;
}

/** One log line from arbitrary output: newlines gone, long output clipped. */
export function oneLine(text: string, limit = 200): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** The one-line cause a failed walk reports, so the log names it before the detail. */
export function causeLine(probes: Probe[]): string {
	const spawns = probes.filter((probe) => probe.attempts.every((entry) => entry.spawn !== null));
	const silent = probes.filter(
		(probe) => !probe.runs && probe.attempts.every((entry) => entry.spawn === null),
	);
	const parts: string[] = [];
	if (spawns.length > 0) parts.push(`${spawns.length} could not be created at all`);
	if (silent.length > 0) parts.push(`${silent.length} started and died before answering`);
	return parts.join("; ") || "none answered";
}

/**
 * The named skip when no candidate can be launched, with the evidence that made it a skip.
 *
 * A red `main` that can never go green is not a measurement, and a skip that names what was found and
 * what each candidate did is not a hidden failure. This line is the whole record: how many candidates
 * there were, where they came from, whether their library sat beside them, and the statuses every
 * route returned.
 */
export function skipLine(probes: Probe[]): string {
	const candidates = probes.length;
	const sources = [...new Set(probes.map((probe) => probe.candidate.source))].join(", ");
	const withLoader = probes.filter((probe) => probe.candidate.loads).length;
	const statuses = [
		...new Set(
			probes.flatMap((probe) =>
				probe.attempts
					.filter((entry) => entry.spawn === null)
					.map((entry) => describeExit(entry.exit)),
			),
		),
	];
	const refused = probes.filter((probe) =>
		probe.attempts.every((entry) => entry.spawn !== null),
	).length;
	const outcome =
		statuses.length === 0
			? "every route refused to create the process"
			: `every route exited ${statuses.join(" or ")}`;
	return `${candidates} lldb-dap candidate(s) from ${sources}, ${withLoader} with liblldb.dll beside it, ${refused} refused by the OS: ${outcome}`;
}
