import { useMemo } from "react";
import { pinKey } from "@/lib/debug/watch";
import type { BreakpointEntry, BreakpointRow, DebugController } from "./sessionTypes";
import { breakpointKey, groupByPath, sortBreakpoints } from "./sessionTypes";

/**
 * The rows the breakpoints panel renders, sorted by path then line.
 *
 * A row is derived from the map rather than stored, so a verdict folded back by `syncFile` shows up
 * without a second copy to keep in step.
 */
export function useBreakpointRows(map: Map<string, Map<number, BreakpointEntry>>): {
	rows: BreakpointRow[];
	byPath: Map<string, BreakpointRow[]>;
} {
	const rows = useMemo(() => {
		const next: BreakpointRow[] = [];
		for (const [path, lines] of map) {
			for (const [line, entry] of lines) {
				next.push({
					key: breakpointKey(path, line),
					path,
					line,
					verified: entry.verified,
					message: entry.message,
					condition: entry.condition,
					hitCondition: entry.hitCondition,
					logMessage: entry.logMessage,
					enabled: entry.enabled,
					temporary: entry.temporary,
				});
			}
		}
		return sortBreakpoints(next);
	}, [map]);
	const byPath = useMemo(() => groupByPath(rows), [rows]);
	return { rows, byPath };
}

/** The set of pins, keyed for the tree's quick membership test. */
export function usePinnedKeys(pins: DebugController["pins"]): Set<string> {
	return useMemo(() => new Set(pins.map(pinKey)), [pins]);
}
