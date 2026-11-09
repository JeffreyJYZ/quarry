import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMissingSessionError } from "@/lib/lsp/errors";
import {
	type RootSignals,
	type ServerKind,
	serversForRoot,
	sessionId as makeSessionId,
} from "@/lib/lsp/served";
import { startLsp, stopLsp } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { ServerState, ServerStates } from "@/lib/status/model";

export type { ServerState, ServerStates } from "@/lib/status/model";

/** One entry per kind, always: an absent server is state, not a missing key. */
export type LspStatusMap = ServerStates;

const ABSENT: ServerState = { phase: "absent" };
const STARTING: ServerState = { phase: "starting" };
const ENDED: ServerState = { phase: "ended" };

function useOneServer(
	root: string | null,
	kind: ServerKind,
	enabled: boolean,
	report: (message: string) => void,
	path: string,
	args: string[],
	restartToken: number,
): { state: ServerState; end: () => void } {
	const [state, setState] = useState<ServerState>(ABSENT);
	const reportRef = useRef(report);
	reportRef.current = report;

	// biome-ignore lint/correctness/useExhaustiveDependencies: effect runs per session identity
	useEffect(() => {
		if (root === null || !enabled) {
			setState(ABSENT);
			return;
		}
		setState(STARTING);
		const sessionId = makeSessionId(kind, root);
		let live = true;
		startLsp(sessionId, path, args).then(
			(next) => {
				if (live) setState({ phase: "ready", status: next });
			},
			(error) => {
				if (!live) return;
				// A start that failed has no session to name: leaving the last status here would make
				// the chip claim a server the project does not have.
				setState(ENDED);
				reportRef.current(`${kind}: ${describeError(error)}`);
			},
		);
		return () => {
			live = false;
			setState(ABSENT);
			stopLsp(sessionId).catch((error: unknown) => {
				if (isMissingSessionError(error)) return;
				reportRef.current(`${kind} stop: ${describeError(error)}`);
			});
		};
	}, [root, kind, enabled, path, args.join(" "), restartToken]);

	/** The server's reader thread finished: its last answer describes a process that is gone. */
	const end = useCallback(() => {
		setState((current) => (current.phase === "ready" ? ENDED : current));
	}, []);

	return { state, end };
}

export function useLspServers(
	root: string | null,
	signals: RootSignals | null,
	report: (message: string) => void,
	overrides: Partial<Record<ServerKind, { path?: string; args?: string[] }>> = {},
	restartToken = 0,
): { statuses: LspStatusMap; markEnded: (kind: ServerKind) => void } {
	const kinds = signals === null ? [] : serversForRoot(signals);
	const rust = useOneServer(
		root,
		"rust-analyzer",
		kinds.includes("rust-analyzer"),
		report,
		overrides["rust-analyzer"]?.path ?? "",
		overrides["rust-analyzer"]?.args ?? [],
		restartToken,
	);
	const clang = useOneServer(
		root,
		"clangd",
		kinds.includes("clangd"),
		report,
		overrides.clangd?.path ?? "",
		overrides.clangd?.args ?? [],
		restartToken,
	);
	// A stable map: `useDocumentSync` keys its open/close effect on it, so a fresh object each render
	// would close and reopen the document on every render — and a close publishes empty diagnostics,
	// which clears the very findings the reopen brings back.
	const statuses = useMemo<LspStatusMap>(
		() => ({ "rust-analyzer": rust.state, clangd: clang.state }),
		[rust.state, clang.state],
	);
	const rustEnd = rust.end;
	const clangEnd = clang.end;
	const markEnded = useCallback(
		(kind: ServerKind) => {
			if (kind === "rust-analyzer") rustEnd();
			else clangEnd();
		},
		[rustEnd, clangEnd],
	);
	return { statuses, markEnded };
}
