/**
 * A rename as seen by the open buffers.
 *
 * Renaming a folder renames every path beneath it, so a buffer is remapped by testing whether it is
 * under the old path. A string prefix test would move `/p/src/util2` along with `/p/src/util`, and
 * `paths.ts` already owns both separators.
 */

import type { FileBuffer } from "./buffer";
import { fileName, isUnder, relativeTo, separatorOf, trimTrailingSeparators } from "./paths";

/** `path` moved from `oldBase` to `newBase`, or unchanged when it is not under `oldBase`. */
export function remapPath(path: string, oldBase: string, newBase: string): string {
	if (!isUnder(oldBase, path)) return path;
	const relative = relativeTo(oldBase, path);
	if (relative === null) return path;
	if (relative === "") return newBase;
	let next = trimTrailingSeparators(newBase);
	const separator = separatorOf(next);
	for (const part of relative.split("/")) {
		next = next.endsWith(separator) ? `${next}${part}` : `${next}${separator}${part}`;
	}
	return next;
}

/** Every buffer under `oldBase` moved to `newBase`; a buffer elsewhere is returned untouched. */
export function remapBuffers(
	buffers: readonly FileBuffer[],
	oldBase: string,
	newBase: string,
): FileBuffer[] {
	return buffers.map((buffer) => {
		const path = remapPath(buffer.path, oldBase, newBase);
		return path === buffer.path ? buffer : { ...buffer, path, name: fileName(path) };
	});
}
