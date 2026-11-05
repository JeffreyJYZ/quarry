import { useCallback, useState } from "react";
import { RESTART_NOTICE } from "@/lib/lsp/restart";

/**
 * The counter the restart command bumps.
 *
 * `useLspServers` keys each server's effect on it, so incrementing it tears every session down and
 * starts it again — the same lifecycle a project switch uses, rather than a second code path that
 * could drift from it.
 */
export function useLspRestart(reportNotice: (message: string) => void): {
	token: number;
	restart: () => void;
} {
	const [token, setToken] = useState(0);
	const restart = useCallback(() => {
		setToken((current) => current + 1);
		reportNotice(RESTART_NOTICE);
	}, [reportNotice]);
	return { token, restart };
}
