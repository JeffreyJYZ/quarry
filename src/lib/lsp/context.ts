import { type ServerKind, servedByRunningServer, sessionId } from "@/lib/lsp/served";

/**
 * The live language-server context, published by the shell.
 *
 * Session ids are composed from the root and the set of running servers, and features far from the
 * shell — problem quick fixes, source actions — would otherwise need that pair drilled through
 * every component between.
 */
let current: { root: string | null; running: ReadonlySet<ServerKind> } = {
	root: null,
	running: new Set(),
};

export function setLspContext(root: string | null, running: ReadonlySet<ServerKind>): void {
	current = { root, running };
}

/** The session a path's requests belong to, or null when no running server serves it. */
export function sessionForContext(path: string | null): string | null {
	if (path === null || current.root === null) return null;
	const kind = servedByRunningServer(path, current.running);
	if (kind === null) return null;
	return sessionId(kind, current.root);
}
