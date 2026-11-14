/**
 * Letting the program run out, then closing the adapter.
 *
 * A `continue` after a watchpoint hit has nowhere to stop, so a failed one is recorded rather than
 * raised: the run-to-completion event is the reading that matters.
 */

import type { Context } from "./state";

export async function finishRun(ctx: Context, threadId: number): Promise<void> {
	const { client, report } = ctx;
	let continueError: string | null = null;
	try {
		await client.send("continue", { threadId }, 5_000);
	} catch (error) {
		continueError = error instanceof Error ? error.message : String(error);
	}
	const done = await client
		.waitForEvent((e) => e.event === "terminated" || e.event === "exited", 15_000)
		.catch(() => null);
	report.finish = done
		? { event: done.event, exitCode: done.body?.exitCode ?? null, continueError }
		: { event: "timeout", exitCode: null, continueError };

	try {
		await client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
	} catch {
		// adapter may already be gone; the child is killed by the caller either way
	}
}
