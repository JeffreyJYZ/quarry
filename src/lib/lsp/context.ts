import { type ServerKind, servedByRunningServer, sessionId } from "@/lib/lsp/served";

/**
 * The live language-server context, published by the shell.
 *
 * Session ids are composed from the root and the set of running servers, and features far from the
 * shell — problem quick fixes, source actions — would otherwise need that pair drilled through
 * every component between.
 */
export type LspContext = { root: string | null; running: ReadonlySet<ServerKind> };

let current: LspContext = {
	root: null,
	running: new Set(),
};

const listeners = new Set<() => void>();

function sameKinds(a: ReadonlySet<ServerKind>, b: ReadonlySet<ServerKind>): boolean {
	return a.size === b.size && [...a].every((kind) => b.has(kind));
}

/** A listener hears it only when the root or the running set's members really changed. */
export function subscribeLspContext(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * The live pair, replaced only on a real change.
 *
 * The identity is what `useSyncExternalStore` compares, so a shell render that republishes the same
 * servers must not swap the object: doing so would re-render every consumer on every render.
 */
export function lspContext(): LspContext {
	return current;
}

export function setLspContext(root: string | null, running: ReadonlySet<ServerKind>): void {
	if (root === current.root && sameKinds(current.running, running)) return;
	current = { root, running };
	for (const listener of [...listeners]) listener();
}

/** The session a path's requests belong to, or null when no running server serves it. */
export function sessionForContext(path: string | null): string | null {
	if (path === null || current.root === null) return null;
	const kind = servedByRunningServer(path, current.running);
	if (kind === null) return null;
	return sessionId(kind, current.root);
}

/**
 * Every running session id for the project.
 *
 * A shell-wide notification — files changed on disk — has no single path to derive a session from,
 * so it goes to each server that is running: rust-analyzer for the crate, clangd for the C sources.
 */
export function runningSessions(): string[] {
	if (current.root === null) return [];
	return [...current.running].map((kind) => sessionId(kind, current.root as string));
}
