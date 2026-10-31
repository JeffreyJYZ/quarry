/** How a finished run ended, as one short line. */
export type RunExitLike = { code: number | null; killed?: boolean };

/**
 * Human-readable exit status.
 *
 * A stopped run says "stopped"; a null code with no stop means the process died
 * from a signal rather than a normal exit, so it must not read as exit code 0.
 */
export function exitStatusText(exit: RunExitLike): string {
	if (exit.killed === true) return "stopped";
	if (exit.code === null) return "terminated by signal";
	if (exit.code === 0) return "exited with code 0";
	return `exited with code ${exit.code}`;
}
