import { useCallback } from "react";
import { dapConfigurationDone, dapRestart, dapSetBreakpointsEx } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { fileName } from "@/lib/problems/model";
import type { BreakpointEntry, StopView } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/**
 * Restarting in place: the adapter hands back a new session id, so every breakpoint file is re-sent
 * and the exception filters are re-applied with the user's ticks kept.
 */
export function useRestart(options: {
	sessionRef: { current: string | null };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	generationRef: { current: number };
	restarting: boolean;
	loadExceptionFilters: (session: string, preserveChecked: boolean) => Promise<void>;
	setError: (message: string | null) => void;
	setStopView: Setter<StopView | null>;
	setChildren: Setter<Map<number, import("@/lib/project/api").DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setSelectedVariable: Setter<import("./sessionTypes").VariableRow | null>;
	setSessionId: Setter<string | null>;
	setRestarting: Setter<boolean>;
	setRestarted: Setter<boolean>;
	setExceptionFilters: Setter<import("@/lib/project/api").ExceptionFilter[]>;
}) {
	const {
		sessionRef,
		breakpointMapRef,
		generationRef,
		restarting,
		loadExceptionFilters,
		setError,
		setStopView,
		setChildren,
		setExpanded,
		setSelectedVariable,
		setSessionId,
		setRestarting,
		setRestarted,
		setExceptionFilters,
	} = options;

	return useCallback(async () => {
		const session = sessionRef.current;
		if (session === null || restarting) return;
		setRestarting(true);
		setError(null);
		generationRef.current += 1;
		setStopView(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		let nextId: string;
		try {
			const next = await dapRestart(session);
			nextId = next.id;
		} catch (reason) {
			setError(`Restart: ${describeError(reason)}`);
			setRestarting(false);
			return;
		}
		sessionRef.current = nextId;
		setSessionId(nextId);
		setRestarted(true);
		setExceptionFilters([]);
		/* Re-push every breakpoint file. */
		for (const path of [...breakpointMapRef.current.keys()]) {
			const lines = breakpointMapRef.current.get(path);
			if (lines === undefined) continue;
			const rows = [...lines.entries()]
				.filter(([, entry]) => entry.enabled)
				.map(([line, entry]) => ({
					line,
					condition: entry.condition,
					hitCondition: entry.hitCondition,
					logMessage: entry.logMessage,
					enabled: true,
				}));
			try {
				await dapSetBreakpointsEx(nextId, path, rows);
			} catch (reason) {
				setError(`Breakpoints: ${fileName(path)}: ${describeError(reason)}`);
			}
			if (sessionRef.current !== nextId) return;
		}
		await loadExceptionFilters(nextId, true);
		try {
			await dapConfigurationDone(nextId);
		} catch (reason) {
			setError(`Configuration done: ${describeError(reason)}`);
		}
		setRestarting(false);
	}, [
		sessionRef,
		breakpointMapRef,
		generationRef,
		restarting,
		loadExceptionFilters,
		setError,
		setStopView,
		setChildren,
		setExpanded,
		setSelectedVariable,
		setSessionId,
		setRestarting,
		setRestarted,
		setExceptionFilters,
	]);
}
