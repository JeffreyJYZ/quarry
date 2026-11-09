import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useRootSignals } from "@/lib/lsp/rootSignals";
import { useDocumentSync, useLspServers, type LspStatusMap } from "@/lib/lsp/session";
import { setLspContext } from "@/lib/lsp/context";
import { NO_RESTART_IN_FLIGHT, restartSettled } from "@/lib/lsp/restart";
import type { ServerKind } from "@/lib/lsp/served";

export type LspWiringOptions = {
	root: string | null;
	activePath: string | null;
	activeText: string;
	report: (message: string) => void;
	overrides: Partial<Record<ServerKind, { path?: string; args?: string[] }>>;
	/** Bumped by the restart command: every server for this root stops and starts again. */
	restartToken: number;
	/** Kept in a ref so the editor guards read the live set without re-rendering. */
	runningRef: MutableRefObject<ReadonlySet<ServerKind>>;
	/** Called once when a restart's servers are answering again, so its progress notice can go. */
	onRestarted?: () => void;
};

/**
 * The language-server side of the shell: which servers a root needs, their sessions, the document
 * sync, and the running set the editor guards consult.
 *
 * `running` is returned rather than only parked in a ref: diagnostics are published per server, so
 * the shell needs the same set to drop the findings of a server that has just stopped.
 */
export function useLspWiring(options: LspWiringOptions): {
	statuses: LspStatusMap;
	running: ReadonlySet<ServerKind>;
} {
	const signals = useRootSignals(options.root);
	const statuses = useLspServers(
		options.root,
		signals,
		options.report,
		options.overrides,
		options.restartToken,
	);
	const running = useMemo(
		() =>
			new Set(
				(Object.keys(statuses) as ServerKind[]).filter((kind) => statuses[kind] != null),
			),
		[statuses],
	);
	useEffect(() => {
		options.runningRef.current = running;
		setLspContext(options.root, running);
	}, [running, options.root, options.runningRef]);

	// A restart's notice is progress, not a failure: it goes away once the servers it stopped are
	// answering again. The teardown has to be seen first — the render that bumps the token still
	// reports the previous sessions as running.
	const emptiedToken = useRef(NO_RESTART_IN_FLIGHT);
	const onRestarted = options.onRestarted;
	useEffect(() => {
		const token = options.restartToken;
		if (onRestarted === undefined) return;
		if (running.size === 0) {
			emptiedToken.current = token;
			return;
		}
		if (!restartSettled(token, emptiedToken.current, running.size)) return;
		emptiedToken.current = NO_RESTART_IN_FLIGHT;
		onRestarted();
	}, [running, options.restartToken, onRestarted]);

	useDocumentSync({
		root: options.root,
		path: options.activePath,
		text: options.activeText,
		report: options.report,
		ready: running.size > 0,
		statuses,
	});

	return { statuses, running };
}
