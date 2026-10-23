import { useCallback, useEffect, useRef } from "react";
import type { DapStoppedEvent, DapVariable, ExceptionFilter } from "@/lib/project/api";
import { onDapStopped, onDapTerminated } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { Pin, PinResult } from "@/lib/debug/watch";
import type { BreakpointEntry, StopView, VariableRow, WatchRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type EventDeps = {
	sessionRef: { current: string | null };
	watchRef: { current: WatchRow[] };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	generationRef: { current: number };
	commitMap: (next: Map<string, Map<number, BreakpointEntry>>) => void;
	handleStop: (event: DapStoppedEvent) => Promise<void>;
	setError: (message: string | null) => void;
	setSessionId: Setter<string | null>;
	setLaunching: Setter<boolean>;
	setRestarting: Setter<boolean>;
	setStopView: Setter<StopView | null>;
	setSessionBuildProfile: Setter<"debug" | "release" | null>;
	setChildren: Setter<Map<number, DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setSelectedVariable: Setter<VariableRow | null>;
	setWatchPoints: Setter<WatchRow[]>;
	setPins: Setter<Pin[]>;
	setPinResults: Setter<Map<string, PinResult>>;
	setExceptionFilters: Setter<ExceptionFilter[]>;
	setExceptionChecked: Setter<Set<string>>;
};

/**
 * The adapter's two events.
 *
 * One subscription each for the app's lifetime; the handlers are reached through refs so a render
 * never re-registers a listener that the backend would then have twice.
 */
export function useDebugEvents(deps: EventDeps) {
	const {
		sessionRef,
		watchRef,
		breakpointMapRef,
		generationRef,
		commitMap,
		handleStop,
		setError,
		setSessionId,
		setLaunching,
		setRestarting,
		setStopView,
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

	/** A terminated session drops its temporary breakpoints and every live row. */
	const handleTerminated = useCallback(
		(session: string) => {
			if (sessionRef.current !== null && session !== sessionRef.current) return;
			const nextMap = new Map(breakpointMapRef.current);
			for (const [path, lines] of nextMap) {
				const nextLines = new Map(lines);
				let changed = false;
				for (const [line, entry] of nextLines) {
					if (entry.temporary) {
						nextLines.delete(line);
						changed = true;
					}
				}
				if (changed) {
					if (nextLines.size === 0) nextMap.delete(path);
					else nextMap.set(path, nextLines);
				}
			}
			commitMap(nextMap);
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
		},
		[
			breakpointMapRef,
			commitMap,
			generationRef,
			sessionRef,
			watchRef,
			setChildren,
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
		],
	);

	const stopHandler = useRef(handleStop);
	stopHandler.current = handleStop;
	const terminatedHandler = useRef(handleTerminated);
	terminatedHandler.current = handleTerminated;

	useEffect(() => {
		let live = true;
		let offStopped: (() => void) | null = null;
		let offTerminated: (() => void) | null = null;
		onDapStopped((event) => {
			void stopHandler.current(event);
		}).then(
			(unlisten) => {
				if (live) offStopped = unlisten;
				else unlisten();
			},
			(reason) => {
				if (live) setError(`Debug events: ${describeError(reason)}`);
			},
		);
		onDapTerminated((session) => terminatedHandler.current(session)).then(
			(unlisten) => {
				if (live) offTerminated = unlisten;
				else unlisten();
			},
			(reason) => {
				if (live) setError(`Debug events: ${describeError(reason)}`);
			},
		);
		return () => {
			live = false;
			offStopped?.();
			offTerminated?.();
		};
	}, [setError]);

	return { handleTerminated };
}
