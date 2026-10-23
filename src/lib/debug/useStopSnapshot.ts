import { useCallback } from "react";
import { type DapStoppedEvent, dapStackTrace, dapThreads } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { BreakpointEntry, StopView } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type StopDeps = {
	sessionRef: { current: string | null };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	generationRef: { current: number };
	commitMap: (next: Map<string, Map<number, BreakpointEntry>>) => void;
	syncFile: (path: string) => Promise<void>;
	loadFrame: (session: string, frameId: number) => Promise<void>;
	refreshPins: (session: string) => Promise<void>;
	setLaunching: Setter<boolean>;
	setRestarting: Setter<boolean>;
	setRestarted: Setter<boolean>;
	setError: (message: string | null) => void;
	setStopView: Setter<StopView | null>;
	setChildren: Setter<Map<number, import("@/lib/project/api").DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setSelectedVariable: Setter<import("./sessionTypes").VariableRow | null>;
};

/**
 * One stop: drop the temporary run-to-cursor breakpoints, then read threads, the stack and the top
 * frame's variables. A later stop bumps the generation so this one's landings are discarded.
 */
export function useStopSnapshot(deps: StopDeps) {
	const {
		sessionRef,
		breakpointMapRef,
		generationRef,
		commitMap,
		syncFile,
		loadFrame,
		refreshPins,
		setLaunching,
		setRestarting,
		setRestarted,
		setError,
		setStopView,
		setChildren,
		setExpanded,
		setSelectedVariable,
	} = deps;

	return useCallback(
		async (event: DapStoppedEvent) => {
			if (sessionRef.current === null || event.session !== sessionRef.current) return;
			const session = event.session;
			/* Remove any temporary (run-to-cursor) breakpoints on the first stop. */
			const tempPaths = new Set<string>();
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
					tempPaths.add(path);
				}
			}
			if (tempPaths.size > 0) {
				commitMap(nextMap);
				for (const path of tempPaths) void syncFile(path);
			}
			setLaunching(false);
			setRestarting(false);
			setRestarted(false);
			setError(null);
			const generation = ++generationRef.current;
			setStopView({
				reason: event.reason,
				description: event.description,
				threadId: event.threadId,
				frames: [],
				frameId: null,
				scopes: [],
			});
			setChildren(new Map());
			setExpanded(new Set());
			setSelectedVariable(null);
			try {
				const threads = await dapThreads(session);
				if (generation !== generationRef.current) return;
				const threadId = event.threadId ?? threads[0]?.id ?? null;
				if (threadId === null) {
					setError("Stopped with no thread to inspect");
					return;
				}
				const frames = await dapStackTrace(session, threadId);
				if (generation !== generationRef.current) return;
				const top = frames[0] ?? null;
				setStopView((current) =>
					current === null
						? current
						: { ...current, threadId, frames, frameId: top === null ? null : top.id },
				);
				if (top === null) return;
				await loadFrame(session, top.id);
				await refreshPins(session);
			} catch (reason) {
				if (generation === generationRef.current)
					setError(`Stack: ${describeError(reason)}`);
			}
		},
		[
			breakpointMapRef,
			commitMap,
			generationRef,
			loadFrame,
			refreshPins,
			sessionRef,
			setChildren,
			setError,
			setExpanded,
			setLaunching,
			setRestarted,
			setRestarting,
			setSelectedVariable,
			setStopView,
			syncFile,
		],
	);
}
