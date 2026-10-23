import { useCallback } from "react";
import { type DapBreakpoint, dapSetBreakpoints, dapSetBreakpointsEx } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { fileName } from "@/lib/problems/model";
import { type BreakpointEntry, breakpointKey } from "./sessionTypes";

/**
 * Sending breakpoints to the adapter and folding its verdicts back.
 *
 * With no live session the map is only recorded — a launch re-sends everything — and a plain set is
 * sent through the simple request so adapters that reject conditions still work.
 */
export function useBreakpointSync(options: {
	sessionRef: { current: string | null };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	setBreakpointMap: (next: Map<string, Map<number, BreakpointEntry>>) => void;
	setError: (message: string | null) => void;
}) {
	const { sessionRef, breakpointMapRef, setBreakpointMap, setError } = options;

	/**
	 * Commit one breakpoint set, then fold the adapter's verdicts back onto the matching line.
	 */
	const commitMap = useCallback(
		(next: Map<string, Map<number, BreakpointEntry>>) => {
			breakpointMapRef.current = next;
			setBreakpointMap(next);
		},
		[breakpointMapRef, setBreakpointMap],
	);

	const syncFile = useCallback(
		async (path: string) => {
			const session = sessionRef.current;
			const lines = breakpointMapRef.current.get(path);
			if (session === null) return;
			const rows = [...(lines ?? new Map<number, BreakpointEntry>()).entries()].sort(
				(left, right) => left[0] - right[0],
			);
			const plain = rows.every(
				([, entry]) =>
					entry.enabled &&
					entry.condition === null &&
					entry.hitCondition === null &&
					entry.logMessage === null,
			);
			let results: DapBreakpoint[];
			try {
				results = plain
					? await dapSetBreakpoints(
							session,
							path,
							rows.map(([line]) => line),
						)
					: await dapSetBreakpointsEx(
							session,
							path,
							rows
								.filter(([, entry]) => entry.enabled)
								.map(([line, entry]) => ({
									line,
									condition: entry.condition,
									hitCondition: entry.hitCondition,
									logMessage: entry.logMessage,
									enabled: true,
								})),
						);
			} catch (reason) {
				setError(`Breakpoints: ${fileName(path)}: ${describeError(reason)}`);
				return;
			}
			if (sessionRef.current !== session) return;
			const verdicts = new Map<string, { verified: boolean; message: string | null }>();
			if (plain || results.length === rows.length) {
				rows.forEach(([line], index) => {
					const result = results[index];
					if (result === undefined) {
						verdicts.set(breakpointKey(path, line), {
							verified: false,
							message: "adapter reported no breakpoint",
						});
						return;
					}
					const moved = result.line !== null && result.line !== line;
					verdicts.set(breakpointKey(path, line), {
						verified: result.verified,
						message: result.message ?? (moved ? `moved to line ${result.line}` : null),
					});
				});
			} else {
				for (const [line] of rows) {
					const result = results.find((candidate) => candidate.line === line);
					verdicts.set(breakpointKey(path, line), {
						verified: result?.verified ?? false,
						message: result?.message ?? null,
					});
				}
			}
			if (verdicts.size === 0) return;
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(next.get(path) ?? []);
			for (const [line] of rows) {
				const entry = nextLines.get(line);
				const verdict = verdicts.get(breakpointKey(path, line));
				if (entry === undefined || verdict === undefined) continue;
				nextLines.set(line, {
					...entry,
					verified: verdict.verified,
					message: verdict.message,
				});
			}
			next.set(path, nextLines);
			commitMap(next);
		},
		[breakpointMapRef, commitMap, sessionRef, setError],
	);

	const syncAll = useCallback(async () => {
		for (const path of [...breakpointMapRef.current.keys()]) await syncFile(path);
	}, [breakpointMapRef, syncFile]);

	return { commitMap, syncFile, syncAll };
}
