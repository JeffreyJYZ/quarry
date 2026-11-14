#!/usr/bin/env bun
/**
 * The debugger story one Windows row tells, as assertions.
 *
 * The order is the product's own: launch, place the breakpoint, finish the handshake, inspect the
 * stopped frame, evaluate the local in that frame, step once and read the local's new value, then
 * continue to the program's end. Each claim gets one line; the window of the conversation it is
 * judged on is recorded with it, so a failure can quote the exact request and response.
 *
 * A step that throws becomes a failed assertion rather than an escaped error: the row still reports
 * every claim it did check, and the exchange that stopped it is in the window it opened.
 */

import type { DapClient } from "./windows-debug-dap-client";
import { Checks } from "./windows-debug-checks";
import {
	configurationDone,
	evaluate,
	integerValue,
	launchAdapter,
	runToExit,
	setBreakpoint,
	stepOver,
	topFrame,
	waitForStop,
} from "./windows-debug-dap-session";
import { MAIN_SOURCE } from "./windows-debug-fixture";
import { sameSource, verbatimPath } from "./windows-debug-toolchain";

/** What the session is pointed at: the binary, its directory, and the two statements. */
export interface SessionTarget {
	program: string;
	cwd: string;
	breakpointPath: string;
	breakpointLine: number;
	stepLine: number;
}

/** Run every assertion the row makes, and answer with the record of them. */
export async function assertDebugSession(
	client: DapClient,
	target: SessionTarget,
): Promise<Checks> {
	const checks = new Checks();
	let from = client.mark();
	try {
		await launchAdapter(client, { program: target.program, cwd: target.cwd });

		// The verbatim spelling first, because the plain one is the breakpoint the session keeps:
		// setting the same file again replaces it. What the adapter does with the prefix is evidence,
		// not a requirement — the product never sends it — so it is a note, not an assertion.
		const verbatim = verbatimPath(target.breakpointPath);
		if (verbatim !== null) {
			from = client.mark();
			const spelled = await setBreakpoint(client, verbatim, target.breakpointLine);
			checks.note(
				"the verbatim spelling the project tree carries",
				spelled.verified
					? "the adapter placed it"
					: `the adapter refused it (${spelled.message || "no message"})`,
			);
		}

		from = client.mark();
		const placed = await setBreakpoint(client, target.breakpointPath, target.breakpointLine);
		checks.add(
			`breakpoint verified at ${MAIN_SOURCE}:${target.breakpointLine}`,
			placed.verified,
			placed.message,
			from,
			client.mark(),
		);

		from = client.mark();
		const stop = await configurationDone(client, from);
		const first = await topFrame(client, stop.threadId);
		checks.add(
			`stopped frame is ${MAIN_SOURCE}:${target.breakpointLine}`,
			sameSource(first.path, target.breakpointPath) && first.line === target.breakpointLine,
			`frame ${first.path}:${first.line} (reason ${stop.reason})`,
			from,
			client.mark(),
		);

		from = client.mark();
		const before = await evaluate(client, "total", first.id);
		checks.add(
			"evaluate total before the step reads 0",
			integerValue(before) === 0,
			`result ${JSON.stringify(before)}`,
			from,
			client.mark(),
		);

		from = client.mark();
		await stepOver(client, stop.threadId);
		const second = await waitForStop(client, from);
		const frame = await topFrame(client, second.threadId);
		checks.add(
			`step advanced past ${MAIN_SOURCE}:${target.breakpointLine}`,
			sameSource(frame.path, target.breakpointPath) && frame.line >= target.stepLine,
			`frame ${frame.path}:${frame.line}`,
			from,
			client.mark(),
		);

		from = client.mark();
		const after = await evaluate(client, "total", frame.id);
		checks.add(
			"evaluate total after the step reads 5",
			integerValue(after) === 5,
			`result ${JSON.stringify(after)}`,
			from,
			client.mark(),
		);

		from = client.mark();
		const ended = await runToExit(client, second.threadId, from);
		checks.add(
			`continue reached the program's end (${ended})`,
			ended === "exited" || ended === "terminated",
			`event ${ended}`,
			from,
			client.mark(),
		);
	} catch (error) {
		checks.add(
			"the session reached every step",
			false,
			error instanceof Error ? error.message : String(error),
			from,
			client.mark(),
		);
	}
	return checks;
}
