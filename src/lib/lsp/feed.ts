import { useEffect, useRef } from "react";
import { type Diagnostic, onDiagnostics } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type DiagnosticsFeedOptions = {
	/** Root of the open project; events for any other root are dropped. */
	root: string | null;
	onPublish: (path: string, diagnostics: Diagnostic[]) => void;
	onError: (message: string) => void;
};

/**
 * Subscribe to `lsp://diagnostics` once for the app's lifetime. The listener reads the current root
 * and handlers from a ref, so switching projects or re-rendering never re-subscribes.
 */
export function useDiagnosticsFeed({ root, onPublish, onError }: DiagnosticsFeedOptions): void {
	const latest = useRef({ root, onPublish, onError });
	latest.current = { root, onPublish, onError };

	useEffect(() => {
		let live = true;
		let unlisten: (() => void) | null = null;
		onDiagnostics((event) => {
			const current = latest.current;
			if (current.root === null || event.root !== current.root) {
				return;
			}
			current.onPublish(event.path, event.diagnostics);
		}).then(
			(stop) => {
				if (live) {
					unlisten = stop;
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
		return () => {
			live = false;
			unlisten?.();
		};
	}, []);
}
