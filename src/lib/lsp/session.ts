import { useEffect, useRef, useState } from "react";
import {
	type LspStatus,
	lspChangeDocument,
	lspCloseDocument,
	lspOpenDocument,
	startLsp,
	stopLsp,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import {
	serverKindForPath,
	serversForRoot,
	sessionId as makeSessionId,
	type RootSignals,
	type ServerKind,
} from "@/lib/lsp/served";

const CHANGE_DEBOUNCE_MS = 350;

export type LspStatusMap = Partial<Record<ServerKind, LspStatus | null>>;

function useOneServer(
	root: string | null,
	kind: ServerKind,
	enabled: boolean,
	report: (message: string) => void,
	path: string,
	args: string[],
): LspStatus | null {
	const [status, setStatus] = useState<LspStatus | null>(null);
	const reportRef = useRef(report);
	reportRef.current = report;

	// biome-ignore lint/correctness/useExhaustiveDependencies: effect runs per session identity
	useEffect(() => {
		setStatus(null);
		if (root === null || !enabled) {
			return;
		}
		const sessionId = makeSessionId(kind, root);
		let live = true;
		startLsp(sessionId, path, args).then(
			(next) => {
				if (live) setStatus(next);
			},
			(error) => {
				if (live) reportRef.current(`${kind}: ${describeError(error)}`);
			},
		);
		return () => {
			live = false;
			setStatus(null);
			stopLsp(sessionId).catch((error: unknown) => {
				reportRef.current(`${kind} stop: ${describeError(error)}`);
			});
		};
	}, [root, kind, enabled, path, args.join(" ")]);

	return status;
}

export function useLspServers(
	root: string | null,
	signals: RootSignals | null,
	report: (message: string) => void,
	overrides: Partial<Record<ServerKind, { path?: string; args?: string[] }>> = {},
): LspStatusMap {
	const kinds = signals === null ? [] : serversForRoot(signals);
	const rustEnabled = kinds.includes("rust-analyzer");
	const clangEnabled = kinds.includes("clangd");
	const rustOverrides = overrides["rust-analyzer"] ?? {};
	const clangOverrides = overrides.clangd ?? {};
	const rustStatus = useOneServer(
		root,
		"rust-analyzer",
		rustEnabled,
		report,
		rustOverrides.path ?? "",
		rustOverrides.args ?? [],
	);
	const clangStatus = useOneServer(
		root,
		"clangd",
		clangEnabled,
		report,
		clangOverrides.path ?? "",
		clangOverrides.args ?? [],
	);
	const out: LspStatusMap = {};
	if (rustEnabled) {
		out["rust-analyzer"] = rustStatus;
	}
	if (clangEnabled) {
		out.clangd = clangStatus;
	}
	return out;
}

export type DocumentSyncOptions = {
	root: string | null;
	path: string | null;
	text: string;
	report: (message: string) => void;
	ready: boolean;
	statuses: LspStatusMap;
};

export function useDocumentSync({
	root,
	path,
	text,
	report,
	ready,
	statuses,
}: DocumentSyncOptions): void {
	const latest = useRef({ text, report });
	latest.current = { text, report };
	const opened = useRef<{ root: string; path: string; text: string } | null>(null);

	useEffect(() => {
		if (root === null || path === null || !ready) {
			return;
		}
		const kind = serverKindForPath(path);
		if (kind === null) {
			return;
		}
		const sessionId = makeSessionId(kind, root);
		if (statuses[kind] === undefined || statuses[kind] === null) {
			return;
		}
		const initial = latest.current.text;
		let live = true;
		lspOpenDocument(sessionId, path, initial).then(
			() => {
				if (!live) return;
				opened.current = { root, path, text: initial };
				const current = latest.current.text;
				if (current !== initial) {
					lspChangeDocument(sessionId, path, current).catch((error) => {
						latest.current.report(`Sync document: ${describeError(error)}`);
					});
				}
			},
			(error) => {
				if (live) latest.current.report(`Open document: ${describeError(error)}`);
			},
		);
		return () => {
			live = false;
			const open = opened.current;
			if (open !== null && open.root === root && open.path === path) {
				opened.current = null;
				lspCloseDocument(sessionId, path).catch((error) => {
					latest.current.report(`Close document: ${describeError(error)}`);
				});
			}
		};
	}, [root, path, ready, statuses]);

	useEffect(() => {
		if (root === null || path === null) {
			return;
		}
		const kind = serverKindForPath(path);
		if (kind === null) return;
		const sessionId = makeSessionId(kind, root);
		if (statuses[kind] === undefined || statuses[kind] === null) {
			return;
		}
		const open = opened.current;
		if (open !== null && open.root === root && open.path === path && open.text === text) {
			return;
		}
		const timer = setTimeout(() => {
			const open = opened.current;
			if (open !== null && open.root === root && open.path === path && open.text === text) {
				return;
			}
			lspChangeDocument(sessionId, path, text).then(
				() => {
					const current = opened.current;
					if (current !== null && current.root === root && current.path === path) {
						current.text = text;
					}
				},
				(error) => {
					latest.current.report(`Sync document: ${describeError(error)}`);
				},
			);
		}, CHANGE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [root, path, text, statuses]);
}
