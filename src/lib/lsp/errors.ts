import { lspErrorMessage } from "@/lib/lsp/paths";
import { describeError } from "@/lib/project/errors";

/**
 * Whether a failure is just "that session is gone".
 *
 * A restart stops every server, and the document-sync cleanup then closes a document on the session it
 * has already torn down. That is expected; reporting it puts "no language server session" in the notice
 * line after every restart, which reads as a failure of the restart itself.
 */
export function isMissingSessionError(error: unknown): boolean {
	return describeError(error).toLowerCase().includes("no language server session");
}

/**
 * The line a failed symbol read should show, or null when the failure is a restart's own teardown.
 *
 * A session can disappear between "a running server serves this file" and the request itself. That is
 * not a failure of the request but a gap in the race, and the next running-set change asks again, so
 * the panel stays quiet rather than accusing a server that is already coming back.
 */
export function symbolFailureNotice(error: unknown, prefix = ""): string | null {
	if (isMissingSessionError(error)) return null;
	return `${prefix}${lspErrorMessage(describeError(error))}`;
}
