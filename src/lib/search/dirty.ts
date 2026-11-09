/**
 * The one decision that keeps a project-wide replace from throwing away unsaved edits.
 *
 * The backend reads and rewrites files straight from disk, so it cannot see the renderer's buffers.
 * A file with a dirty tab is therefore refused before the command is sent, and every file the
 * replace would overwrite is named.
 */

import { type FileBuffer, isDirty } from "@/lib/project/buffer";

/** Dirty buffers among `targets`, sorted so the message is stable. */
export function dirtyReplaceTargets(
	buffers: readonly FileBuffer[],
	targets: Iterable<string>,
): string[] {
	const wanted = new Set(targets);
	const blocked = new Set<string>();
	for (const buffer of buffers) {
		if (wanted.has(buffer.path) && isDirty(buffer)) {
			blocked.add(buffer.path);
		}
	}
	return [...blocked].sort();
}

/** The error a blocked replace reports; it names every file that must be saved or discarded. */
export function dirtyReplaceMessage(paths: readonly string[]): string {
	return `replace would overwrite unsaved changes in ${paths.join(", ")}: save or discard them first`;
}
