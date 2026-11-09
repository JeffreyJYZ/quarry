import { parentDir } from "@/lib/project/paths";

/**
 * Every directory with a git change at or below it.
 *
 * Computed once for the whole tree: doing it inside each level walked the change list again for
 * every folder on screen, and a collapsed parent still needs the dot.
 */
export function dirsWithChanges(changes: Record<string, unknown>): Set<string> {
	const dirs = new Set<string>();
	for (const path of Object.keys(changes)) {
		for (let current: string | null = path; current !== null; current = parentDir(current)) {
			dirs.add(current);
		}
	}
	return dirs;
}
