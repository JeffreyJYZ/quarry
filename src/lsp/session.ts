import { useEffect, useRef, useState } from "react";
import {
	type LspStatus,
	lspChangeDocument,
	lspCloseDocument,
	lspOpenDocument,
	startLsp,
	stopLsp,
} from "@/project/api";
import { describeError } from "@/project/errors";

/** Full-document sync only; one push per quiet period, not per keystroke. */
const CHANGE_DEBOUNCE_MS = 350;

/**
 * One language server per project root. Opening a project starts it, opening another one stops the
 * previous server first, and closing the project stops the last one.
 */
export function useLspServer(
	root: string | null,
	report: (message: string) => void,
): LspStatus | null {
	const [status, setStatus] = useState<LspStatus | null>(null);
	const reportRef = useRef(report);
	reportRef.current = report;

	useEffect(() => {
		setStatus(null);
		if (root === null) {
			return;
		}
		let live = true;
		startLsp(root).then(
			(next) => {
				if (live) {
					setStatus(next);
				}
			},
			(error) => {
				if (live) {
					reportRef.current(`Language server: ${describeError(error)}`);
				}
			},
		);
		return () => {
			live = false;
			setStatus(null);
			stopLsp(root).catch((error: unknown) => {
				reportRef.current(`Language server stop: ${describeError(error)}`);
			});
		};
	}, [root]);

	return status;
}

export type DocumentSyncOptions = {
	root: string | null;
	path: string | null;
	text: string;
	report: (message: string) => void;
	/** False until the server for this root has started; opening a document before that has no session. */
	ready: boolean;
};

/**
 * Tell the server which document is open, push full text after a quiet period, and close the
 * document when its tab goes away. Every rejection is reported as one line, never thrown.
 */
export function useDocumentSync({ root, path, text, report, ready }: DocumentSyncOptions): void {
	const latest = useRef({ text, report });
	latest.current = { text, report };
	const opened = useRef<{ root: string; path: string; text: string } | null>(null);

	useEffect(() => {
		if (root === null || path === null || !ready) {
			return;
		}
		const initial = latest.current.text;
		let live = true;
		lspOpenDocument(root, path, initial).then(
			() => {
				if (!live) {
					return;
				}
				opened.current = { root, path, text: initial };
				// Edits made while the open was in flight would otherwise never reach the server.
				const current = latest.current.text;
				if (current !== initial) {
					lspChangeDocument(root, path, current).catch((error: unknown) => {
						latest.current.report(`Sync document: ${describeError(error)}`);
					});
				}
			},
			(error) => {
				if (live) {
					latest.current.report(`Open document: ${describeError(error)}`);
				}
			},
		);
		return () => {
			live = false;
			opened.current = null;
			lspCloseDocument(root, path).catch((error: unknown) => {
				latest.current.report(`Close document: ${describeError(error)}`);
			});
		};
	}, [root, path, ready]);

	useEffect(() => {
		if (root === null || path === null) {
			return;
		}
		const timer = setTimeout(() => {
			const open = opened.current;
			if (open !== null && open.root === root && open.path === path && open.text === text) {
				return;
			}
			lspChangeDocument(root, path, text).then(
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
	}, [root, path, text]);
}
