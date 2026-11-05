/**
 * The restart command's progress line, and the rule that takes it away again.
 *
 * A restart is not an event with a result to read: the notice exists so the wait has a reason, and it
 * has done its job the moment the restarted server answers. Left behind it becomes a permanent line
 * about something that finished minutes ago, which is what a plain `report` would do, since every
 * other notice in the app is a failure and stays until dismissed.
 */

/** What the restart posts while the servers come back. */
export const RESTART_NOTICE = "Restarting language server";

/** The token whose teardown has been observed, or -1 when none is in flight. */
export const NO_RESTART_IN_FLIGHT = -1;

/**
 * Whether the notice for `token` should be cleared now.
 *
 * The statuses a restart inherits are the *old* sessions, still reporting running in the render that
 * bumps the token, so "a server is running" is not enough — that would clear the notice before the
 * restart began. The teardown has to be seen first (`emptiedToken === token`), and then a server
 * answering again means the restart is done.
 */
export function restartSettled(token: number, emptiedToken: number, runningCount: number): boolean {
	return token > 0 && emptiedToken === token && runningCount > 0;
}
