import { useCallback } from "react";
import { dapContinueOn } from "@/lib/debug/dap";
import { describeError } from "@/lib/project/errors";
import type { BreakpointEntry, BreakpointField, StopView } from "./sessionTypes";

export type BreakpointActionsDeps = {
	sessionRef: { current: string | null };
	stopRef: { current: StopView | null };
	breakpointMapRef: { current: Map<string, Map<number, BreakpointEntry>> };
	commitMap: (next: Map<string, Map<number, BreakpointEntry>>) => void;
	syncFile: (path: string) => Promise<void>;
	setStopView: (next: StopView | null) => void;
	setError: (message: string | null) => void;
};

/** A breakpoint row with nothing set on it but the line. */
export function blankBreakpoint(temporary = false): BreakpointEntry {
	return {
		condition: null,
		hitCondition: null,
		logMessage: null,
		enabled: true,
		verified: null,
		message: null,
		temporary,
	};
}

/**
 * Breakpoint edits from the gutter, the panel and run-to-cursor.
 *
 * Every one commits the map and then re-sends that one file, because the adapter has no per-line
 * update: a condition change is a new set for the whole path.
 */
export function useBreakpointActions(deps: BreakpointActionsDeps) {
	const { sessionRef, stopRef, breakpointMapRef, commitMap, syncFile, setStopView, setError } =
		deps;

	/** The gutter path: one line of one absolute file, added or removed. */
	const toggleBreakpoint = useCallback(
		(path: string, line: number) => {
			if (path === "" || !Number.isInteger(line) || line < 1) return;
			setError(null);
			const current = breakpointMapRef.current;
			const lines = current.get(path);
			const exists = lines?.has(line);
			const next = new Map(current);
			const nextLines = new Map(lines ?? []);
			if (exists) {
				nextLines.delete(line);
				if (nextLines.size === 0) next.delete(path);
				else next.set(path, nextLines);
			} else {
				nextLines.set(line, blankBreakpoint());
				next.set(path, nextLines);
			}
			commitMap(next);
			void syncFile(path);
		},
		[breakpointMapRef, commitMap, syncFile, setError],
	);

	/** Only offered while stopped: the new line comes from the selected frame's source. */
	const addBreakpoint = useCallback(() => {
		const view = stopRef.current;
		const top = view === null ? null : (view.frames[0] ?? null);
		if (view === null || top === null || top.source === null) {
			setError("Stop first: a breakpoint needs a frame source");
			return;
		}
		const path = top.source;
		const line = top.line;
		const lines = breakpointMapRef.current.get(path);
		if (lines?.has(line)) return;
		setError(null);
		const next = new Map(breakpointMapRef.current);
		const nextLines = new Map(lines ?? []);
		nextLines.set(line, blankBreakpoint());
		next.set(path, nextLines);
		commitMap(next);
		void syncFile(path);
	}, [breakpointMapRef, commitMap, stopRef, syncFile, setError]);

	const removeBreakpoint = useCallback(
		(path: string, line: number) => {
			const lines = breakpointMapRef.current.get(path);
			if (lines === undefined || !lines.has(line)) return;
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(lines);
			nextLines.delete(line);
			if (nextLines.size === 0) next.delete(path);
			else next.set(path, nextLines);
			commitMap(next);
			void syncFile(path);
		},
		[breakpointMapRef, commitMap, syncFile],
	);

	const runToCursor = useCallback(
		async (path: string, line: number) => {
			const session = sessionRef.current;
			if (session === null || path === "" || !Number.isInteger(line) || line < 1) return;
			const lines = breakpointMapRef.current.get(path);
			if (lines?.has(line)) {
				const live = sessionRef.current;
				if (live !== null) {
					try {
						await dapContinueOn(live, stopRef.current?.threadId ?? undefined);
						setStopView(null);
						setError(null);
					} catch (reason) {
						setError(`Continue: ${describeError(reason)}`);
					}
				}
				return;
			}
			setError(null);
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(lines ?? []);
			nextLines.set(line, blankBreakpoint(true));
			next.set(path, nextLines);
			commitMap(next);
			await syncFile(path);
			try {
				await dapContinueOn(session, stopRef.current?.threadId ?? undefined);
				setStopView(null);
				setError(null);
			} catch (reason) {
				setError(`Continue: ${describeError(reason)}`);
			}
		},
		[breakpointMapRef, commitMap, syncFile, sessionRef, stopRef, setStopView, setError],
	);

	const setBreakpointField = useCallback(
		(path: string, line: number, field: BreakpointField, value: string | null) => {
			const lines = breakpointMapRef.current.get(path);
			const entry = lines?.get(line);
			if (entry === undefined) return;
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(lines ?? []);
			nextLines.set(line, { ...entry, [field]: value, verified: null, message: null });
			next.set(path, nextLines);
			commitMap(next);
			void syncFile(path);
		},
		[breakpointMapRef, commitMap, syncFile],
	);

	return { toggleBreakpoint, addBreakpoint, removeBreakpoint, runToCursor, setBreakpointField };
}
