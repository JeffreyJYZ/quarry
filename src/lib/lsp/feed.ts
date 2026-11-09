import { useEffect, useRef } from "react";
import { type Diagnostic, onDiagnostics, onSessionEnded } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type DiagnosticsFeedOptions = {
	/** Root of the open project; events for any other root are dropped. */
	root: string | null;
	onPublish: (path: string, diagnostics: Diagnostic[]) => void;
	/** A server's reader thread ended: everything it published describes a dead program. */
	onSessionEnd?: (server: string) => void;
	onError: (message: string) => void;
};

/**
 * Subscribe to `lsp://diagnostics` once for the app's lifetime. The listener reads the current root
 * and handlers from a ref, so switching projects or re-rendering never re-subscribes.
 */
export function useDiagnosticsFeed({
	root,
	onPublish,
	onSessionEnd,
	onError,
}: DiagnosticsFeedOptions): void {
	const latest = useRef({ root, onPublish, onSessionEnd, onError });
	latest.current = { root, onPublish, onSessionEnd, onError };

	useEffect(() => {
		let live = true;
		const unlisten: Array<() => void> = [];
		const subscribe = (start: Promise<() => void>) =>
			start.then(
				(stop) => {
					if (live) {
						unlisten.push(stop);
					} else {
						stop();
					}
				},
				(error) => {
					if (live) {
						latest.current.onError(`Diagnostics: ${describeError(error)}`);
					}
				},
			);
		void subscribe(
			onDiagnostics((event) => {
				const current = latest.current;
				if (current.root === null || event.root !== current.root) {
					return;
				}
				current.onPublish(event.path, event.diagnostics);
			}),
		);
		void subscribe(
			onSessionEnded((event) => {
				const current = latest.current;
				if (current.root === null || event.root !== current.root) {
					return;
				}
				current.onSessionEnd?.(event.server);
			}),
		);
		return () => {
			live = false;
			for (const stop of unlisten) stop();
		};
	}, []);
}
