import { invoke } from "@tauri-apps/api/core";

/**
 * Continue or step on a named thread.
 *
 * The shared API module's wrappers do not carry a thread id, and the thread decides which
 * stack a step walks, so the two calls the panel needs are driven here instead. Both send the
 * id only when there is one: without it the adapter falls back to the thread that stopped last.
 */
export function dapContinueOn(session: string, threadId?: number): Promise<void> {
	return invoke<void>(
		"dap_continue",
		threadId === undefined ? { session } : { session, threadId },
	);
}

export function dapStepOn(
	session: string,
	kind: "next" | "stepIn" | "stepOut",
	threadId?: number,
): Promise<void> {
	return invoke<void>(
		"dap_step",
		threadId === undefined ? { session, kind } : { session, kind, threadId },
	);
}
