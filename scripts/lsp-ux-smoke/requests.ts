/**
 * Shared numbers for the LSP UX probes: how long a request may take, and how long indexing may take.
 *
 * Indexing `src-tauri` from scratch outruns 30s on a cold CI runner, which made the hover probe
 * report a null answer for a server that was merely still loading.
 */

import type { LspClient } from "../lsp-client";

export const REQ_TIMEOUT = 20_000;
export const INDEX_TIMEOUT = 90_000;

/** The identifier every probe points at: `run` inside the call in `main.rs`. */
export const POSITION = { line: 4, character: 18 };

export interface ProbeResult {
	fatal: boolean;
	lines: string[];
}

/** One request, reported as `{ fatal, lines }` so the caller keeps the output order. */
export type Probe = (
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
) => Promise<ProbeResult>;
