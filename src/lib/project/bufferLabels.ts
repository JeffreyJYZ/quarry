import { directoryOf, fileName, relativeTo } from "@/lib/project/paths";

/** One open buffer as a picker row: its name, and the folder only when the name is ambiguous. */
export type BufferLabel = {
	path: string;
	name: string;
	/** The folder that tells two same-named files apart; null when the name is already unique. */
	folder: string | null;
};

/**
 * The labels a buffer picker shows.
 *
 * A list of names alone is ambiguous the moment a project holds `src/main.rs` beside `tests/main.rs`,
 * so a duplicate name carries its folder; the folder is project-relative when the root is known.
 */
export function bufferLabels(
	buffers: readonly { path: string }[],
	root: string | null,
): BufferLabel[] {
	const counts = new Map<string, number>();
	for (const buffer of buffers) {
		const name = fileName(buffer.path);
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return buffers.map((buffer) => {
		const name = fileName(buffer.path);
		if ((counts.get(name) ?? 0) < 2) return { path: buffer.path, name, folder: null };
		const dir = directoryOf(buffer.path);
		const relative = root === null ? null : relativeTo(root, dir);
		return { path: buffer.path, name, folder: relative ?? dir };
	});
}
