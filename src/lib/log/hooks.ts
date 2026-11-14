/**
 * Window-level failure capture.
 *
 * A React error boundary only sees a throw during render or a lifecycle method. The failure this
 * exists for is neither: CodeMirror builds and reads its transaction inside an input handler, so a
 * range error escapes as an uncaught window error and a boundary would never hear about it.
 * `window.onerror` is the cheaper and the only reliable hook for that class, and
 * `unhandledrejection` covers the async half so a dropped promise is not silent either.
 */

import { currentDocumentLength } from "@/lib/editor/liveDocument";
import { failureFromThrown, logUiError, type UiFailure } from "@/lib/log/api";

type FailureEvent = {
	error?: unknown;
	message?: string;
	filename?: string;
	lineno?: number;
	colno?: number;
};

type RejectionEvent = { reason?: unknown };

/** The one method these hooks need, so a test can pass a stub instead of a window. */
export type ListenerTarget = {
	addEventListener(type: string, listener: (event: unknown) => void): void;
};

/**
 * Install the two listeners. Called once from `main.tsx` before the first render, so a failure
 * during startup is captured too.
 */
export function installErrorLogging(
	target: ListenerTarget = window,
	report: (failure: UiFailure) => Promise<string | null> = logUiError,
): void {
	target.addEventListener("error", (event) => {
		const failure = fromErrorEvent(event as FailureEvent);
		send(report, { ...failure, source: "window.error", documentLength: lengthOrUndefined() });
	});
	target.addEventListener("unhandledrejection", (event) => {
		const failure = failureFromThrown((event as RejectionEvent).reason);
		send(report, {
			...failure,
			source: "unhandledrejection",
			documentLength: lengthOrUndefined(),
		});
	});
}

/** A reporter that throws must not become the next unhandled error. */
function send(report: (failure: UiFailure) => Promise<string | null>, failure: UiFailure): void {
	try {
		void report(failure);
	} catch {
		// Nothing to do: the original failure is the one worth keeping.
	}
}

function fromErrorEvent(event: FailureEvent): Pick<UiFailure, "name" | "message" | "stack"> {
	if (event.error !== undefined && event.error !== null) return failureFromThrown(event.error);
	// A cross-origin or older throw arrives with a message and a location instead of an Error.
	const where = event.filename
		? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
		: undefined;
	return {
		name: "Uncaught",
		message: event.message ?? "no message",
		stack: where === undefined ? undefined : `at ${where}`,
	};
}

function lengthOrUndefined(): number | undefined {
	return currentDocumentLength() ?? undefined;
}
