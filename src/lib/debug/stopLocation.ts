import type { BreakpointRow } from "@/lib/debug/breakpointTypes";
import type { DebugStatus, StopView } from "@/lib/debug/sessionTypes";
import { fileName } from "@/lib/project/paths";

/**
 * Where the debuggee is stopped: the top frame's file and 1-based line.
 *
 * lldb-dap answers `hitBreakpointIds: null`, so a stop is never attributable by id. The top frame is
 * the only place the location exists, and every reader matches it by path and line.
 */
export type StopLocation = { path: string | null; line: number };

/** The top frame's location, or null while the session is not stopped. */
export function stopLocation(status: DebugStatus, view: StopView | null): StopLocation | null {
	if (status !== "stopped") return null;
	const top = view?.frames[0] ?? null;
	if (top === null || top.line < 1) return null;
	return { path: top.source, line: top.line };
}

/** True only for the row the top frame is on; a stop between rows marks none of them. */
export function isCurrentBreakpoint(
	row: Pick<BreakpointRow, "path" | "line">,
	location: StopLocation | null,
): boolean {
	return location !== null && location.path === row.path && location.line === row.line;
}

/** The breakpoints header's text, or null when nothing is stopped. */
export function stopLabel(location: StopLocation | null): string | null {
	if (location === null) return null;
	if (location.path === null) return `stopped at line ${location.line}`;
	return `stopped at ${fileName(location.path)}:${location.line}`;
}
