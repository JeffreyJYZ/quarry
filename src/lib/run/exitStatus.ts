/** How a finished run ended, as one short line. */
export type RunExitLike = {
	code: number | null;
	/** The signal that killed the child, when one did; the backend reports it separately. */
	signal?: number | null;
	/** The user pressed Stop, so the status is "stopped" whatever the signal says. */
	killed?: boolean;
};

/** The signals a run actually dies from, so the panel names them instead of printing a number. */
const SIGNAL_NAMES: Record<number, string> = {
	2: "SIGINT",
	3: "SIGQUIT",
	4: "SIGILL",
	6: "SIGABRT",
	8: "SIGFPE",
	9: "SIGKILL",
	11: "SIGSEGV",
	13: "SIGPIPE",
	15: "SIGTERM",
};

/** `SIGSEGV` for a known signal, `signal 7` for one this table does not name. */
export function signalName(signal: number): string {
	return SIGNAL_NAMES[signal] ?? `signal ${signal}`;
}

/**
 * Human-readable exit status.
 *
 * A stopped run says "stopped"; a signal says which one; a null code with no signal means the
 * process vanished without a status, so it must not read as exit code 0.
 */
export function exitStatusText(exit: RunExitLike): string {
	if (exit.killed === true) return "stopped";
	if (exit.signal !== undefined && exit.signal !== null) {
		return `terminated by ${signalName(exit.signal)}`;
	}
	if (exit.code === null) return "terminated without a status";
	if (exit.code === 0) return "exited with code 0";
	return `exited with code ${exit.code}`;
}
