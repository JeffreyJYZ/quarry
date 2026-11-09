import { useEffect, useRef } from "react";
import { isMissingSessionError } from "@/lib/lsp/errors";
import { serverKindForPath, sessionId as makeSessionId } from "@/lib/lsp/served";
import type { LspStatusMap } from "@/lib/lsp/session";
import { lspChangeDocument, lspCloseDocument, lspOpenDocument } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

const CHANGE_DEBOUNCE_MS = 350;

export type DocumentSyncOptions = {
	root: string | null;
	path: string | null;
	text: string;
	report: (message: string) => void;
	/** Some server is answering; the per-file check below narrows it to this file's server. */
	ready: boolean;
	statuses: LspStatusMap;
};

/**
 * Keep the server that serves the active file in step with its text.
 *
 * A server only receives files it serves, so every effect here is gated on that kind being `ready`
 * — not merely on some server being up. Sending a document to a server that is starting, ended or
 * absent asks a process that is not there.
 */
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
	// One value per running server, not the map's identity: the effects below open and close the
	// document, and a close publishes empty diagnostics for the file.
	const kind = serverKindForPath(path);
	const serverReady = kind !== null && statuses[kind].phase === "ready";

	useEffect(() => {
		if (root === null || path === null || kind === null || !serverReady || !ready) {
			return;
		}
		const sessionId = makeSessionId(kind, root);
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
					if (isMissingSessionError(error)) return;
					latest.current.report(`Close document: ${describeError(error)}`);
				});
			}
		};
	}, [root, path, kind, serverReady, ready]);

	useEffect(() => {
		if (root === null || path === null || kind === null || !serverReady) {
			return;
		}
		const sessionId = makeSessionId(kind, root);
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
	}, [root, path, text, kind, serverReady]);
}
