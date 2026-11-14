#!/usr/bin/env bun
/**
 * The launch shape `src-tauri/src/dap/**` uses, one request per step, and the assertions a row
 * reports.
 *
 * Three things here are the product's measured traps, not style. `initialize` sends the arguments
 * the product sends, because a client that asks for less gets less. Breakpoints are set *before*
 * `configurationDone`, which is the order `dap_launch` promises its caller. And every `evaluate`
 * carries the stopped frame's own `frameId`: without it lldb-dap refuses every expression even
 * while the program is stopped, which reads as a broken product.
 */

import type { DapClient } from "./windows-debug-dap-client";

type Json = Record<string, unknown>;

/** The `initialize` arguments `src-tauri/src/dap/initialize.rs` sends, verbatim. */
export const INITIALIZE_ARGUMENTS = {
	clientID: "quarry",
	clientName: "quarry",
	adapterID: "lldb",
	linesStartAt1: true,
	columnsStartAt1: true,
	pathFormat: "path",
	supportsVariableType: true,
	supportsVariablePaging: true,
	supportsMemoryReferences: true,
	supportsRunInTerminalRequest: false,
};

/** What a debug session is launched with: the binary and the directory it runs in. */
export interface Launch {
	program: string;
	cwd: string;
}

/** The stop a session reports: which thread stopped, and why the adapter says it did. */
export interface Stop {
	threadId: number;
	reason: string;
}

/** The frame an assertion is made against. */
export interface Frame {
	id: number;
	name: string;
	line: number;
	path: string;
}

/** `initialize`, `launch`, then the `initialized` event: the product's handshake, in that order. */
export async function launchSession(client: DapClient, launch: Launch): Promise<void> {
	const from = client.mark();
	await client.send("initialize", INITIALIZE_ARGUMENTS);
	await client.send("launch", {
		program: launch.program,
		args: [],
		cwd: launch.cwd,
		stopOnEntry: false,
		initCommands: [],
	});
	await client.event("initialized", from);
}

/** One breakpoint, and whether the adapter could place it — the signal a Windows stop depends on. */
export async function setBreakpoint(
	client: DapClient,
	path: string,
	line: number,
): Promise<{ verified: boolean; message: string }> {
	const body = bodyOf(
		await client.send("setBreakpoints", {
			source: { path },
			breakpoints: [{ line }],
			sourceModified: false,
		}),
	);
	const places = Array.isArray(body.breakpoints) ? body.breakpoints : [];
	const first = (places[0] ?? {}) as Json;
	return {
		verified: first.verified === true,
		message: typeof first.message === "string" ? first.message : "",
	};
}

/** Finish the handshake, then wait for the stop it promised. */
export async function configurationDone(client: DapClient, from: number): Promise<Stop> {
	await client.send("configurationDone", {});
	return await waitForStop(client, from);
}

/** The stop that follows a step or a continue, on whichever thread reports it. */
export async function waitForStop(client: DapClient, from: number): Promise<Stop> {
	const event = await client.event("stopped", from);
	const body = bodyOf(event);
	return {
		threadId: Number(body.threadId ?? 0),
		reason: String(body.reason ?? ""),
	};
}

/** The frame a stop is inspected through; `frameId` is what an `evaluate` must carry. */
export async function topFrame(client: DapClient, threadId: number): Promise<Frame> {
	const body = bodyOf(await client.send("stackTrace", { threadId, startFrame: 0, levels: 1 }));
	const frames = Array.isArray(body.stackFrames) ? body.stackFrames : [];
	const frame = (frames[0] ?? {}) as Json;
	const source = (frame.source ?? {}) as Json;
	return {
		id: Number(frame.id ?? 0),
		name: String(frame.name ?? ""),
		line: Number(frame.line ?? 0),
		path: String(source.path ?? ""),
	};
}

/** Evaluate one expression in the stopped frame, in the context the product defaults to. */
export async function evaluate(
	client: DapClient,
	expression: string,
	frameId: number,
): Promise<string> {
	const body = bodyOf(await client.send("evaluate", { expression, frameId, context: "watch" }));
	return String(body.result ?? "");
}

/** Step over one statement, on the thread that stopped. */
export async function stepOver(client: DapClient, threadId: number): Promise<void> {
	await client.send("next", { threadId });
}

/** Continue, then wait for the program to end: `exited` and `terminated` are lldb-dap's own pair. */
export async function runToExit(
	client: DapClient,
	threadId: number,
	from: number,
): Promise<string> {
	await client.send("continue", { threadId });
	const event = await client.eventAmong(["exited", "terminated"], from);
	return String(event.event);
}

/**
 * End the session the way the product's shutdown does.
 *
 * lldb-dap stays alive after `terminated` until it is told to disconnect, so a row that only waits
 * for the process to leave on its own waits out its whole timeout and then kills it. A refusal is
 * expected when the session is already gone, and is not a failure.
 */
export async function disconnect(client: DapClient): Promise<void> {
	try {
		await client.send("disconnect", { terminateDebuggee: true, restart: false });
	} catch {
		// The adapter had already exited; there is nothing left to disconnect.
	}
}

/** The integer an evaluated result carries, or null when it carries none.
 *
 * The last number, not the first: lldb's repl form prepends `(int) $0 = `, whose `$0` is the
 * expression's own name and not the value the row is asserting.
 */
export function integerValue(result: string): number | null {
	const matches = result.match(/-?\d+/g);
	if (matches === null) return null;
	return Number(matches[matches.length - 1]);
}

/** The `body` of a response or event, which every adapter message may omit. */
function bodyOf(message: Json): Json {
	return (message.body ?? {}) as Json;
}
