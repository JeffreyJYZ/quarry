#!/usr/bin/env bun
/**
 * What a failed assertion prints: the exact exchange, the process that ended it, and its own words.
 *
 * A Windows runner cannot be replayed by hand, so the log has to carry four things together — which
 * command was sent, what came back, what the adapter was launched as, and how its process ended. The
 * first two are per assertion; the last two are per session, and they are what turned the first
 * startup death into a bare `exit 53` with no cause.
 */

import { describeExit } from "./windows-debug-exit";

type Json = Record<string, unknown>;

/** One message that crossed the pipe, in the order it crossed. */
export interface Exchange {
	kind: "request" | "response" | "event";
	message: Json;
}

/** What a report reads: the whole conversation, both streams, and the process that ended it. */
export interface SessionTrace {
	log: Exchange[];
	errors: string[];
	spawn: string;
	exit: number | null;
}

/** How much of an event reaches the log; a `terminated` event carries kilobytes of LLDB statistics. */
const EVENT_CLIP = 2000;

/** The messages between two marks: requests and responses exactly, events clipped. */
export function report(trace: SessionTrace, from: number, to = trace.log.length): string[] {
	return trace.log.slice(from, to).map(({ kind, message }) => {
		const arrow = kind === "request" ? "→" : kind === "response" ? "←" : "•";
		const text = JSON.stringify(message);
		if (kind !== "event" || text.length <= EVENT_CLIP) return `${arrow} ${text}`;
		const name = String(message.event ?? "event");
		return `${arrow} ${text.slice(0, EVENT_CLIP)}… (${name} clipped, ${text.length} chars)`;
	});
}

/** The last lines of a stderr capture, in order, with blank lines gone. */
export function stderrTail(errors: string[], limit = 12): string[] {
	return errors
		.flatMap((chunk) => chunk.split(/\r?\n/))
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.slice(-limit);
}

/** The adapter's own last words, which carry the cause a refused request does not. */
export function stderrBlock(trace: SessionTrace, limit = 12): string[] {
	const said = stderrTail(trace.errors, limit);
	const head = said.length === 0 ? "--- lldb-dap stderr: (empty) ---" : "--- lldb-dap stderr ---";
	return [head, ...said];
}

/** How the session was launched and how it ended, so a startup death is read from facts. */
export function contextBlock(trace: SessionTrace): string[] {
	const exit = trace.exit === null ? "still running" : describeExit(trace.exit);
	return [`--- spawn: ${trace.spawn} ---`, `--- exit: ${exit} ---`];
}
