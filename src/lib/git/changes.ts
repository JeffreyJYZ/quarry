import type { GitStatus, GitStatusEntry } from "@/lib/project/api";

/**
 * Path to status for the explorer's change dots, in the order git listed them.
 *
 * A later entry for the same path wins, matching `Object.fromEntries`; the empty map is what a
 * project with no status read yet shows.
 */
export function changesByPath(status: GitStatus | null): Record<string, GitStatusEntry["status"]> {
	const changes: Record<string, GitStatusEntry["status"]> = {};
	for (const entry of status?.entries ?? []) changes[entry.path] = entry.status;
	return changes;
}
