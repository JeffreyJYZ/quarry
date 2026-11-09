import { useCallback } from "react";
import {
	dapConfigurationDone,
	dapRestart,
	dapSetBreakpointsEx,
	dapSetDataBreakpoints,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { fileName } from "@/lib/project/paths";
import { restartPush } from "./restartPush";
import type { BreakpointEntry, StopView, WatchRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/**
 * Restarting in place: the adapter hands back a new session id, so every breakpoint file is re-sent
 * and the exception filters are re-applied with the user's ticks kept.
 */
export function useRestart(options: {
	sessionRef: { current: string | null };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	watchRef: { current: WatchRow[] };
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
		watchRef,
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
		/* Re-push every breakpoint file, the exception filters and the watchpoints. */
		const push = restartPush(breakpointMapRef.current, watchRef.current);
		for (const file of push.files) {
			try {
				await dapSetBreakpointsEx(nextId, file.path, file.breakpoints);
			} catch (reason) {
				setError(`Breakpoints: ${fileName(file.path)}: ${describeError(reason)}`);
			}
			if (sessionRef.current !== nextId) return;
		}
		await loadExceptionFilters(nextId, true);
		if (sessionRef.current !== nextId) return;
		if (push.dataIds.length > 0) {
			try {
				await dapSetDataBreakpoints(nextId, push.dataIds);
			} catch (reason) {
				setError(`Watch: ${describeError(reason)}`);
			}
			if (sessionRef.current !== nextId) return;
		}
		try {
			await dapConfigurationDone(nextId);
		} catch (reason) {
			setError(`Configuration done: ${describeError(reason)}`);
		}
		setRestarting(false);
	}, [
		sessionRef,
		breakpointMapRef,
		watchRef,
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
