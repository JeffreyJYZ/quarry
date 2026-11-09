/**
 * The restart command's progress line, and the rule that takes it away again.
 *
 * A restart is not an event with a result to read: the notice exists so the wait has a reason, and it
 * has done its job the moment no restarted server is still starting — whether it answered, and
 * whether it was the only server the root ever runs. Requiring a *running* server to clear it left
 * the line behind forever when the server failed to start or when the root runs none at all.
 */

/** What the restart posts while the servers come back. */
export const RESTART_NOTICE = "Restarting language server";

/** The token whose teardown has been observed, or -1 when none is in flight. */
export const NO_RESTART_IN_FLIGHT = -1;

/**
 * Whether the notice for `token` should be cleared now.
 *
 * The statuses a restart inherits are the *old* sessions, still reporting ready in the render that
 * bumps the token, so "nothing is starting" is not enough — that would clear the notice before the
 * restart began. The teardown has to be seen first (`emptiedToken === token`); after that, the
 * restart is done once no server is still on its way up.
 */
export function restartSettled(
	token: number,
	emptiedToken: number,
	startingCount: number,
): boolean {
	return token > 0 && emptiedToken === token && startingCount === 0;
}
