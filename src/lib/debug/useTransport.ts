import { useCallback } from "react";
import { useRestart } from "./useRestart";
import { dapContinueOn, dapStepOn } from "@/lib/debug/dap";
import { dapStop } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { BreakpointEntry, StopView, StepKind, WatchRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type TransportDeps = {
	sessionRef: { current: string | null };
	stopRef: { current: StopView | null };
	watchRef: { current: WatchRow[] };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	generationRef: { current: number };
	restarting: boolean;
	loadExceptionFilters: (session: string, preserveChecked: boolean) => Promise<void>;
	setError: (message: string | null) => void;
	setStopView: Setter<StopView | null>;
	setSessionId: Setter<string | null>;
	setLaunching: Setter<boolean>;
	setRestarting: Setter<boolean>;
	setRestarted: Setter<boolean>;
	setSessionBuildProfile: Setter<"debug" | "release" | null>;
	setChildren: Setter<Map<number, import("@/lib/project/api").DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setSelectedVariable: Setter<import("./sessionTypes").VariableRow | null>;
	setWatchPoints: Setter<WatchRow[]>;
	setPins: Setter<import("@/lib/debug/watch").Pin[]>;
	setPinResults: Setter<Map<string, import("@/lib/debug/watch").PinResult>>;
	setExceptionFilters: Setter<import("@/lib/project/api").ExceptionFilter[]>;
	setExceptionChecked: Setter<Set<string>>;
};

/** Resume, step, stop and restart against the live adapter. */
export function useTransport(deps: TransportDeps) {
	const {
		sessionRef,
		stopRef,
		watchRef,
		breakpointMapRef,
		generationRef,
		restarting,
		loadExceptionFilters,
		setError,
		setStopView,
		setSessionId,
		setLaunching,
		setRestarting,
		setRestarted,
		setSessionBuildProfile,
		setChildren,
		setExpanded,
		setSelectedVariable,
		setWatchPoints,
		setPins,
		setPinResults,
		setExceptionFilters,
		setExceptionChecked,
	} = deps;

	const continueRun = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) return;
		try {
			await dapContinueOn(session, stopRef.current?.threadId ?? undefined);
			setStopView(null);
			setError(null);
		} catch (reason) {
			setError(`Continue: ${describeError(reason)}`);
		}
	}, [sessionRef, stopRef, setError, setStopView]);

	const step = useCallback(
		async (kind: StepKind) => {
			const session = sessionRef.current;
			if (session === null) return;
			try {
				await dapStepOn(session, kind, stopRef.current?.threadId ?? undefined);
				setStopView(null);
				setError(null);
			} catch (reason) {
				setError(`Step: ${describeError(reason)}`);
			}
		},
		[sessionRef, stopRef, setError, setStopView],
	);

	const stop = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) return;
		try {
			await dapStop(session);
			setError(null);
		} catch (reason) {
			setError(`Stop: ${describeError(reason)}`);
		}
		generationRef.current += 1;
		sessionRef.current = null;
		setSessionId(null);
		setLaunching(false);
		setRestarting(false);
		setStopView(null);
		setSessionBuildProfile(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		watchRef.current = [];
		setWatchPoints([]);
		setPins([]);
		setPinResults(new Map());
		setExceptionFilters([]);
		setExceptionChecked(new Set());
	}, [
		sessionRef,
		watchRef,
		generationRef,
		setChildren,
		setError,
		setExceptionChecked,
		setExceptionFilters,
		setExpanded,
		setLaunching,
		setPinResults,
		setPins,
		setRestarting,
		setSelectedVariable,
		setSessionBuildProfile,
		setSessionId,
		setStopView,
		setWatchPoints,
	]);

	const restart = useRestart({
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
	});

	return { continueRun, step, stop, restart };
}
