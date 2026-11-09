import { useCallback } from "react";
import { useRestart } from "./useRestart";
import { dropTemporary } from "./breakpointTypes";
import { dapContinueOn, dapStepOn } from "@/lib/debug/dap";
import { dapStop } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { TransportGate } from "@/lib/debug/transportGate";
import type { BreakpointEntry, StopView, StepKind, WatchRow } from "./sessionTypes";
import type { BuildProfile } from "@/lib/debug/profile";
type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type TransportDeps = {
	sessionRef: { current: string | null };
	stopRef: { current: StopView | null };
	watchRef: { current: WatchRow[] };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	generationRef: { current: number };
	gate: TransportGate;
	commitMap: (next: Map<string, Map<number, BreakpointEntry>>) => void;
	restarting: boolean;
	loadExceptionFilters: (session: string, preserveChecked: boolean) => Promise<void>;
	setError: (message: string | null) => void;
	setStopView: Setter<StopView | null>;
	setSessionId: Setter<string | null>;
	setLaunching: Setter<boolean>;
	setRestarting: Setter<boolean>;
	setRestarted: Setter<boolean>;
	setSessionBuildProfile: Setter<BuildProfile | null>;
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
		gate,
		commitMap,
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

	/** Nothing in the tree describes the old stop any more. */
	const clearStopRows = useCallback(() => {
		setStopView(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
	}, [setChildren, setExpanded, setSelectedVariable, setStopView]);

	const continueRun = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) return;
		await gate.run(async () => {
			try {
				await dapContinueOn(session, stopRef.current?.threadId ?? undefined);
				clearStopRows();
				setError(null);
			} catch (reason) {
				setError(`Continue: ${describeError(reason)}`);
			}
		});
	}, [clearStopRows, gate, sessionRef, stopRef, setError]);

	const step = useCallback(
		async (kind: StepKind) => {
			const session = sessionRef.current;
			if (session === null) return;
			await gate.run(async () => {
				try {
					await dapStepOn(session, kind, stopRef.current?.threadId ?? undefined);
					clearStopRows();
					setError(null);
				} catch (reason) {
					setError(`Step: ${describeError(reason)}`);
				}
			});
		},
		[clearStopRows, gate, sessionRef, stopRef, setError],
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
		/* A manual stop emits no stopped event, so its run-to-cursor breakpoints die here. */
		const dropped = dropTemporary(breakpointMapRef.current);
		if (dropped.paths.length > 0) commitMap(dropped.next);
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
		breakpointMapRef,
		commitMap,
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
