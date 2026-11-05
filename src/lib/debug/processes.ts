import type { ProcessInfo } from "@/lib/project/api";

import { PROCESS_LIMIT } from "@/lib/consts/debug";

export { PROCESS_LIMIT } from "@/lib/consts/debug";

/** Stable name-then-pid order, so a refresh never reshuffles the list under the cursor. */
export function sortProcesses(processes: ProcessInfo[]): ProcessInfo[] {
	return [...processes].sort(
		(left, right) => left.name.localeCompare(right.name) || left.pid - right.pid,
	);
}

/** Case-insensitive name or pid match, name-sorted and capped at `limit` rows. */
export function filterProcesses(
	processes: ProcessInfo[],
	query: string,
	limit: number = PROCESS_LIMIT,
): ProcessInfo[] {
	const needle = query.trim().toLowerCase();
	const matched =
		needle === ""
			? processes
			: processes.filter(
					(process) =>
						process.name.toLowerCase().includes(needle) ||
						String(process.pid).includes(needle),
				);
	return sortProcesses(matched).slice(0, Math.max(0, limit));
}
