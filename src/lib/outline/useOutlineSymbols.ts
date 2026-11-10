import { useEffect, useRef, useState } from "react";
import { symbolFailureNotice } from "@/lib/lsp/errors";
import { isInsideRoot } from "@/lib/lsp/paths";
import { type ServerKind, servedByRunningServer, sessionId } from "@/lib/lsp/served";
import { type DocumentSymbol as LspSymbol, lspSymbols } from "@/lib/project/api";

/** How long a tab change settles before the outline asks for its symbols. */
export const OUTLINE_SETTLE_MS = 300;

const NONE: LspSymbol[] = [];

export type OutlineSymbols = {
	symbols: LspSymbol[];
	loading: boolean;
	error: string | null;
	noServer: boolean;
};

/**
 * One file's document symbols, asked only of a server that is actually running.
 *
 * On relaunch the restored tab exists before `lsp_start` has answered. Composing a session id from
 * the root alone asks for `clangd::<root>` a second early and keeps the refusal on screen, so the
 * running set is a dependency: when clangd joins it the request happens, and until then the panel
 * shows its quiet "no server" line rather than an error.
 */
export function useOutlineSymbols(
	root: string,
	activePath: string | null,
	running: ReadonlySet<ServerKind>,
): OutlineSymbols {
	const [symbols, setSymbols] = useState<LspSymbol[]>(NONE);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [noServer, setNoServer] = useState(false);
	const seqRef = useRef(0);

	useEffect(() => {
		const seq = ++seqRef.current;
		if (activePath === null || !isInsideRoot(root, activePath)) {
			// The server indexes one root; a tab from outside it would come back as an internal error.
			setSymbols(NONE);
			setLoading(false);
			setError(null);
			setNoServer(false);
			return;
		}
		const kind = servedByRunningServer(activePath, running);
		if (kind === null) {
			// Either nothing serves this extension or the server is still starting: both are quiet.
			setSymbols(NONE);
			setLoading(false);
			setError(null);
			setNoServer(true);
			return;
		}
		const sid = sessionId(kind, root);
		setLoading(true);
		setError(null);
		setNoServer(false);
		const timer = window.setTimeout(() => {
			void lspSymbols(sid, activePath).then(
				(result) => {
					if (seqRef.current !== seq) return;
					setSymbols(result);
					setLoading(false);
				},
				(failure: unknown) => {
					if (seqRef.current !== seq) return;
					// A restart can tear the session down between the check and the request: stay
					// quiet and let the next running-set change ask again. A real failure still shows.
					const notice = symbolFailureNotice(failure);
					setSymbols(NONE);
					setError(notice);
					setNoServer(notice === null);
					setLoading(false);
				},
			);
		}, OUTLINE_SETTLE_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [root, activePath, running]);

	return { symbols, loading, error, noServer };
}
