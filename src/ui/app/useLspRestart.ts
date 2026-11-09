import { useCallback, useRef, useState } from "react";
import { RESTART_NOTICE } from "@/lib/lsp/restart";

type SetNotice = (update: (current: string | null) => string | null) => void;

/**
 * The counter the restart command bumps, and the notice that belongs to one restart attempt.
 *
 * `useLspServers` keys each server's effect on the counter, so incrementing it tears every session
 * down and starts it again — the same lifecycle a project switch uses, rather than a second code
 * path that could drift from it.
 *
 * The notice is owned by a token, not by its text: two restarts post the same words, so a late
 * settlement of the first must not clear the second one's line. `settled` clears only when the
 * current owner is the token that just finished and the line is still this restart's.
 */
export function useLspRestart(setNotice: SetNotice): {
	token: number;
	restart: () => void;
	settled: (token: number) => void;
} {
	const [token, setToken] = useState(0);
	const tokenRef = useRef(0);
	const owner = useRef<number | null>(null);

	const restart = useCallback(() => {
		const next = tokenRef.current + 1;
		tokenRef.current = next;
		owner.current = next;
		setToken(next);
		setNotice(() => RESTART_NOTICE);
	}, [setNotice]);

	const settled = useCallback(
		(token: number) => {
			if (owner.current !== token) return;
			owner.current = null;
			setNotice((current) => (current === RESTART_NOTICE ? null : current));
		},
		[setNotice],
	);

	return { token, restart, settled };
}
