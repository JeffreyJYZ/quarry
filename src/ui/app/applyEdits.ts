/**
 * Applying a code-action rename to the open buffers, and saying what happened.
 *
 * Split from `useWorkspace` so the hook stays a wiring layer: the edits come from the language
 * server, the text lives in the buffers, and the only visible output is one notice per outcome.
 */

import type { Dispatch, SetStateAction } from "react";
import { documentVersionOf } from "@/lib/lsp/documentVersions";
import type { FileEdit } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { applyFileEdits, refusalNotice } from "@/lib/refactor/apply";

export async function applyEditsWithNotice(
	edits: FileEdit[],
	buffers: FileBuffer[],
	setBuffers: Dispatch<SetStateAction<FileBuffer[]>>,
	onNotice: (message: string) => void,
): Promise<void> {
	const result = await applyFileEdits(edits, buffers, setBuffers, documentVersionOf);
	if (result.files > 0) onNotice(`Renamed ${result.files} files`);
	for (const failed of result.failed) onNotice(`Failed: ${failed}`);
	for (const refused of result.refused) onNotice(refusalNotice(refused));
	if (result.files === 0 && result.failed.length === 0 && result.refused.length === 0) {
		onNotice("Rename unavailable here");
	}
}
