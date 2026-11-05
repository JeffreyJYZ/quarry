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
