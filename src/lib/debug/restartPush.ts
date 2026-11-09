import type { BreakpointSpec } from "@/lib/project/api";
import type { BreakpointEntry } from "./breakpointTypes";
import type { WatchRow } from "./sessionTypes";

/** Everything a restart carries onto the new session, before `configurationDone`. */
export type RestartPush = {
	files: Array<{ path: string; breakpoints: BreakpointSpec[] }>;
	dataIds: string[];
};

/**
 * The breakpoint files and watchpoints a restart re-sends.
 *
 * Every path is kept even when all its breakpoints are now disabled: sending the empty set is what
 * clears the adapter's old entries for that file. Watchpoints are a whole set too, in the order
 * they were set, because the adapter replaces all of them on each request.
 */
export function restartPush(
	breakpoints: Map<string, Map<number, BreakpointEntry>>,
	watchPoints: readonly WatchRow[],
): RestartPush {
	const files = [...breakpoints].map(([path, lines]) => ({
		path,
		breakpoints: [...lines]
			.filter(([, entry]) => entry.enabled)
			.map(([line, entry]) => ({
				line,
				condition: entry.condition,
				hitCondition: entry.hitCondition,
				logMessage: entry.logMessage,
				enabled: true,
			})),
	}));

	return { files, dataIds: watchPoints.map((watch) => watch.dataId) };
}
