import { useSyncExternalStore } from "react";
import { type LspContext, lspContext, subscribeLspContext } from "@/lib/lsp/context";
import type { ServerKind } from "@/lib/lsp/served";

/**
 * The live root and running set, re-rendering the reader when a server starts or stops.
 *
 * A panel that reads the context once, during a render where every server was assumed to be up,
 * asks the backend for a session that does not exist yet and keeps the refusal on screen until
 * something else makes it render. Subscribing makes "the server just answered" the retry trigger.
 */
export function useLspContext(): LspContext {
	return useSyncExternalStore(subscribeLspContext, lspContext, lspContext);
}

/** The kinds of server answering right now — the set `runningSessions()` turns into ids. */
export function useRunningSessions(): ReadonlySet<ServerKind> {
	return useLspContext().running;
}
