import { invoke } from "@tauri-apps/api/core";
import { SESSION_SEPARATOR } from "@/lib/consts/lsp";

/** One semantic token: a position the grammar cannot classify on its own. */
export type SemanticToken = {
	line: number;
	start: number;
	length: number;
	kind: string;
	modifiers: string[];
};

/**
 * Every semantic token in a file, for highlighting names the grammar cannot tell apart.
 *
 * An empty list is the normal answer from a server with no semantic tokens, so callers treat it as
 * "no extra colour", never as an error.
 */
export function lspSemanticTokens(root: string, path: string): Promise<SemanticToken[]> {
	if (import.meta.env.DEV && !root.includes(SESSION_SEPARATOR)) {
		throw new Error("lsp_semantic_tokens expects a session id, got a path");
	}
	return invoke<SemanticToken[]>("lsp_semantic_tokens", { root, path });
}
