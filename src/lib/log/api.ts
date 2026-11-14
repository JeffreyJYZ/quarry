import { invoke } from "@tauri-apps/api/core";

/** What the boundary caught, in the shape the Rust command records. */
export type UiFailure = {
	/** `TypeError`, `ReferenceError`, or `Thrown` for a non-Error throw. */
	name: string;
	message: string;
	/** The Error's own stack, when the throw had one. */
	stack?: string;
	/** React's component stack, which names the tree that threw. */
	componentStack?: string;
	/** The boundary's region, so a nested failure does not read as the whole window. */
	region?: string;
};

/** The command that writes a renderer failure to the crash log, answering the log's path. */
export type SendLog = (failure: UiFailure) => Promise<string>;

/**
 * Write a caught failure to the crash log and answer where it landed.
 *
 * Never rejects: the panel is already showing the original error, and a log that cannot be written
 * must not replace it with a second failure. `null` means the line did not make it, and the panel
 * simply says nothing about a path.
 */
export async function logUiError(
	failure: UiFailure,
	send: SendLog = (payload) => invoke<string>("log_ui_error", { ...payload }),
): Promise<string | null> {
	try {
		return await send(failure);
	} catch {
		return null;
	}
}
