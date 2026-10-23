import { useCallback } from "react";
import { dapAttach, dapConfigurationDone, type ExceptionFilter } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { StopView } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/** Attaching to a running process by pid. */
export function useAttach(options: {
	rootRef: { current: string | null };
	sessionRef: { current: string | null };
	pidInput: string;
	syncAll: () => Promise<void>;
	loadExceptionFilters: (session: string, preserveChecked: boolean) => Promise<void>;
	setError: (message: string | null) => void;
	setLaunching: Setter<boolean>;
	setStopView: Setter<StopView | null>;
	setSessionId: Setter<string | null>;
	setSessionKind: Setter<string | null>;
	setRestarted: Setter<boolean>;
	setAttachPid: Setter<number | null>;
	setExceptionChecked: Setter<Set<string>>;
	setExceptionFilters: Setter<ExceptionFilter[]>;
}) {
	const { rootRef, sessionRef, pidInput, syncAll, loadExceptionFilters } = options;

	return useCallback(async () => {
		if (rootRef.current === null) {
			options.setError("Open a project first");
			return;
		}
		if (sessionRef.current !== null) {
			options.setError("A debug session is already running");
			return;
		}
		const pid = Number(pidInput.trim());
		if (!Number.isInteger(pid) || pid <= 0) {
			options.setError("Attach: invalid pid");
			return;
		}
		options.setLaunching(true);
		options.setError(null);
		options.setStopView(null);
		let session: { id: string; program: string };
		try {
			session = await dapAttach(pid);
		} catch (reason) {
			options.setError(`Attach: ${describeError(reason)}`);
			options.setLaunching(false);
			return;
		}
		const id = session.id;
		sessionRef.current = id;
		options.setSessionId(id);
		options.setSessionKind("attach");
		options.setRestarted(false);
		options.setAttachPid(pid);
		options.setLaunching(false);
		options.setExceptionFilters([]);
		options.setExceptionChecked(new Set());
		await syncAll();
		await loadExceptionFilters(id, false);
		try {
			await dapConfigurationDone(id);
		} catch (reason) {
			options.setError(`Configuration done: ${describeError(reason)}`);
		}
	}, [rootRef, sessionRef, pidInput, syncAll, loadExceptionFilters, options]);
}
