import { invoke } from "@tauri-apps/api/core";

/** What a failure is recorded as, in the shape the Rust command takes. */
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
	/** `boundary`, `window.error` or `unhandledrejection` — which hook saw it first. */
	source?: string;
	/** The editor's document length at the moment it was caught. */
	documentLength?: number;
};

/** The command that writes a renderer failure to the crash log, answering the log's path. */
export type SendLog = (failure: UiFailure) => Promise<string>;

/**
 * Write a caught failure to the crash log and answer where it landed.
 *
 * Never rejects: a log that cannot be written must not replace the error being reported with a
 * second one. `null` means the line did not make it, and the caller says nothing about a path.
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

/** An error as one line, so a non-Error throw still says something useful. */
export function describe(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error) ?? String(error);
	} catch {
		return String(error);
	}
}

/** Split a thrown value into the name, message and stack the log keeps. */
export function failureFromThrown(thrown: unknown): Pick<UiFailure, "name" | "message" | "stack"> {
	if (thrown instanceof Error) {
		return { name: thrown.name, message: thrown.message, stack: thrown.stack };
	}
	return { name: "Thrown", message: describe(thrown) };
}
