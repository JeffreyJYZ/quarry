import type { ProcessInfo } from "@/lib/project/api";

/** Rows the process picker renders at once; the filter is how the rest are reached. */
export const PROCESS_LIMIT = 50;

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
