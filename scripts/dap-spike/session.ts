/**
 * One stopped session, assembled from the steps that open it: capabilities, the breakpoint, the
 * stop on the marker line, then the frame's variables.
 */

import type { Context, Session } from "./state";
import { open, setBreakpoints, waitForStop } from "./stop";
import { readLocals } from "./locals";

export async function openSession(ctx: Context): Promise<Session> {
	const capabilities = await open(ctx);
	await setBreakpoints(ctx);
	const stop = await waitForStop(ctx);
	const locals = await readLocals(ctx, stop);
	return { capabilities, ...stop, ...locals };
}
