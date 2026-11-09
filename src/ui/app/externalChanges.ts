/**
 * Keeping open buffers in step with disk after an external change.
 *
 * The decision belongs to `src/lib/project/watch.ts` and stays pure; this module only performs what
 * that decision allowed. A buffer is replaced only while it is still clean, checked again after the
 * read returns, so an edit that lands during the read is never thrown away.
 */

import type { Dispatch, RefObject, SetStateAction } from "react";
import { readTextFile } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";
import { buffersToRefresh } from "@/lib/project/watch";

/** The buffer after a clean reload, or `null` when replacing it is no longer safe or needed. */
export function reloaded(entry: FileBuffer, text: string): FileBuffer | null {
	if (entry.text !== entry.loaded || entry.loaded === text) return null;
	return { ...entry, text, loaded: text };
}

/** Build the handler the watcher calls with each batch of changed paths. */
export function externalChangeHandler(
	refs: { buffers: RefObject<FileBuffer[]>; mounted: RefObject<boolean> },
	setBuffers: Dispatch<SetStateAction<FileBuffer[]>>,
	onNotice: (message: string) => void,
): (paths: string[]) => Promise<void> {
	return async (paths) => {
		const { reload, conflicts } = buffersToRefresh(refs.buffers.current, new Set(paths));
		if (conflicts.length > 0) {
			const names = conflicts.map((buffer) => buffer.name).join(", ");
			onNotice(`Changed on disk: ${names} (unsaved changes kept)`);
		}
		await Promise.all(
			reload.map(async (buffer) => {
				try {
					const text = await readTextFile(buffer.path);
					if (!refs.mounted.current) return;
					setBuffers((current) =>
						current.map((entry) =>
							entry.path === buffer.path ? (reloaded(entry, text) ?? entry) : entry,
						),
					);
				} catch (error) {
					if (refs.mounted.current) {
						onNotice(`Could not reload ${buffer.name}: ${describeError(error)}`);
					}
				}
			}),
		);
	};
}
