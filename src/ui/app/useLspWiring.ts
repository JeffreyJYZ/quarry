import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useRootSignals } from "@/lib/lsp/rootSignals";
import type { ServerKind } from "@/lib/lsp/served";
import { useLspServers, type LspStatusMap } from "@/lib/lsp/session";
import type { ServerState } from "@/lib/status/model";
import { setLspContext } from "@/lib/lsp/context";
import { useDocumentSync } from "@/lib/lsp/documentSync";
import { NO_RESTART_IN_FLIGHT, restartSettled } from "@/lib/lsp/restart";

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
	onRestarted?: (token: number) => void;
};

function kindsIn(statuses: LspStatusMap, phase: ServerState["phase"]): ServerKind[] {
	return (Object.keys(statuses) as ServerKind[]).filter((kind) => statuses[kind].phase === phase);
}

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
	markEnded: (kind: ServerKind) => void;
} {
	const signals = useRootSignals(options.root);
	const { statuses, markEnded } = useLspServers(
		options.root,
		signals,
		options.report,
		options.overrides,
		options.restartToken,
	);
	const running = useMemo(() => new Set(kindsIn(statuses, "ready")), [statuses]);
	const starting = useMemo(() => new Set(kindsIn(statuses, "starting")), [statuses]);

	// A restart stops the old session on purpose. Its reader thread ending is the restart's own
	// teardown, not a crash, so it must not take the chip down while the replacement comes up.
	const restartInFlight = useRef(false);
	useEffect(() => {
		if (options.restartToken === 0) return;
		restartInFlight.current = true;
		return () => {
			restartInFlight.current = false;
		};
	}, [options.restartToken]);
	const endWhenNotRestarting = useCallback(
		(kind: ServerKind) => {
			if (restartInFlight.current) return;
			markEnded(kind);
		},
		[markEnded],
	);

	useEffect(() => {
		options.runningRef.current = running;
		setLspContext(options.root, running);
	}, [running, options.root, options.runningRef]);

	// A restart's notice is progress, not a failure: it goes away once the servers it stopped are
	// answering again, or once none is still starting. The teardown has to be seen first — the render
	// that bumps the token still reports the previous sessions as running.
	const emptiedToken = useRef(NO_RESTART_IN_FLIGHT);
	const settledToken = useRef(0);
	const onRestarted = options.onRestarted;
	useEffect(() => {
		const token = options.restartToken;
		if (onRestarted === undefined || token === 0 || token <= settledToken.current) return;
		if (running.size === 0) {
			emptiedToken.current = token;
		}
		if (!restartSettled(token, emptiedToken.current, starting.size)) return;
		settledToken.current = token;
		emptiedToken.current = NO_RESTART_IN_FLIGHT;
		restartInFlight.current = false;
		onRestarted(token);
	}, [running, starting, options.restartToken, onRestarted]);

	useDocumentSync({
		root: options.root,
		path: options.activePath,
		text: options.activeText,
		report: options.report,
		ready: running.size > 0,
		statuses,
	});

	return { statuses, running, markEnded: endWhenNotRestarting };
}
