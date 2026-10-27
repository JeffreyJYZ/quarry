import { useCallback } from "react";
import { dapDataBreakpointInfo, dapSetDataBreakpoints } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { WatchRow } from "./sessionTypes";

/** Data breakpoints: the adapter's `dataId` per watched variable, re-sent as a whole set. */
export function useWatchPoints(options: {
	sessionRef: { current: string | null };
	watchRef: { current: WatchRow[] };
	setWatchPoints: (row: WatchRow[]) => void;
	setError: (message: string | null) => void;
}) {
	const { sessionRef, watchRef, setWatchPoints, setError } = options;

	const addWatchPoint = useCallback(
		async (containerRef: number, name: string) => {
			const session = sessionRef.current;
			if (session === null) {
				setError("Watch points need a live debug session");
				return;
			}
			let info: Awaited<ReturnType<typeof dapDataBreakpointInfo>>;
			try {
				info = await dapDataBreakpointInfo(session, containerRef, name);
			} catch (reason) {
				setError(`Watch: ${describeError(reason)}`);
				return;
			}
			if (sessionRef.current !== session) return;
			if (info.dataId === null) {
				setError(`Cannot watch ${name}: ${info.description || "no data id"}`);
				return;
			}
			const current = watchRef.current;
			if (current.some((watch) => watch.dataId === info.dataId)) return;
			const next: WatchRow[] = [
				...current,
				{ dataId: info.dataId, description: info.description || name },
			];
			watchRef.current = next;
			setWatchPoints(next);
			setError(null);
			try {
				await dapSetDataBreakpoints(
					session,
					next.map((watch) => watch.dataId),
				);
			} catch (reason) {
				setError(`Watch: ${describeError(reason)}`);
			}
		},
		[sessionRef, watchRef, setWatchPoints, setError],
	);

	const removeWatchPoint = useCallback(
		(dataId: string) => {
			const next = watchRef.current.filter((watch) => watch.dataId !== dataId);
			watchRef.current = next;
			setWatchPoints(next);
			const session = sessionRef.current;
			if (session === null) return;
			void dapSetDataBreakpoints(
				session,
				next.map((watch) => watch.dataId),
			).then(
				() => undefined,
				(reason) => setError(`Watch: ${describeError(reason)}`),
			);
		},
		[sessionRef, watchRef, setWatchPoints, setError],
	);

	return { addWatchPoint, removeWatchPoint };
}
