import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	combineDiagnostics,
	countSeverities,
	type DiagnosticMap,
	groupDiagnostics,
	withServerDiagnostics,
} from "@/lib/lsp/diagnostics";
import { useDiagnosticsFeed } from "@/lib/lsp/feed";
import { applyDiagnosticsEvent, type DiagnosticsLifecycleEvent } from "@/lib/lsp/lifecycle";
import { isServerKind, type ServerKind } from "@/lib/lsp/served";
import type { Diagnostic } from "@/lib/project/api";
import { problemFiles } from "@/lib/problems/model";

/**
 * The two diagnostic sources, merged.
 *
 * The language server publishes per file and the build reports per run; a build's findings stay
 * until the next build or until the text they describe is edited, and a restart of the server
 * starts its own map from nothing.
 *
 * Lifetime events arrive from three places — a closed tab, a server that stopped, a file that moved
 * — and each is applied here through one pure decision, so nothing a diagnostic describes can
 * outlive it.
 */
export function useDiagnosticsState(options: {
	root: string | null;
	/** Server kinds answering right now; a kind that leaves took its findings with it. */
	running: ReadonlySet<ServerKind>;
	/** The same end-of-session event, for the status chip rather than for findings. */
	onServerEnd?: (kind: ServerKind) => void;
	onError: (message: string) => void;
}) {
	const [server, setServer] = useState<DiagnosticMap>(() => new Map());
	const [build, setBuild] = useState<DiagnosticMap>(() => new Map());

	const publish = useCallback((path: string, diagnostics: Diagnostic[]) => {
		setServer((current) => withServerDiagnostics(current, path, diagnostics));
	}, []);

	const applyEvent = useCallback((event: DiagnosticsLifecycleEvent) => {
		setServer((current) => applyDiagnosticsEvent(current, event, "server"));
		setBuild((current) => applyDiagnosticsEvent(current, event, "build"));
	}, []);

	const endSession = useCallback(
		(server: string) => {
			if (!isServerKind(server)) return;
			applyEvent({ type: "session-end", kind: server });
			options.onServerEnd?.(server);
		},
		[applyEvent, options.onServerEnd],
	);

	useDiagnosticsFeed({
		root: options.root,
		onPublish: publish,
		onSessionEnd: endSession,
		onError: options.onError,
	});

	// A server that stops on request — a restart, a settings change, a closed project — reports no
	// crash, so its departure is read from the set of kinds that are answering.
	const previousRunning = useRef(options.running);
	const running = options.running;
	useEffect(() => {
		const ended = [...previousRunning.current].filter((kind) => !running.has(kind));
		previousRunning.current = running;
		for (const kind of ended) applyEvent({ type: "session-end", kind });
	}, [running, applyEvent]);

	const setBuildReport = useCallback((diagnostics: Diagnostic[]) => {
		setBuild(groupDiagnostics(diagnostics));
	}, []);

	/**
	 * A restart starts from nothing: the old session's rows describe a process that is gone, so
	 * they go before the replacement publishes. This is an empty publish for every file at once;
	 * build rows are not a server's findings, so they stay.
	 */
	const clearServer = useCallback(() => {
		setServer(new Map());
	}, []);

	const reset = useCallback(() => {
		setServer(new Map());
		setBuild(new Map());
	}, []);

	const diagnostics = useMemo(() => combineDiagnostics(server, build), [server, build]);
	const counts = useMemo(() => countSeverities(diagnostics), [diagnostics]);
	const files = useMemo(() => problemFiles(diagnostics), [diagnostics]);

	return {
		diagnostics,
		counts,
		files,
		publish,
		setBuildReport,
		clearServer,
		reset,
		applyEvent,
	};
}
