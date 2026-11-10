import { ALL_SERVER_KINDS } from "@/lib/consts/lsp";
import { KIND_LABELS } from "@/lib/consts/outline";
import type { LspStatusMap } from "@/lib/lsp/session";
import { type ServerKind, servedByRunningServer, sessionId } from "@/lib/lsp/served";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";

/** How many rows the popup draws, the same cap the outline panel applies. */
export const STRUCTURE_CAP = 400;

function kindLabel(kind: number): string {
	return KIND_LABELS[kind] ?? "sym";
}

/**
 * The symbols a query leaves, in document order.
 *
 * Same substring match as the outline's filter, but without its parent padding: the panel keeps an
 * ancestor so the match has context, while a palette row that did not match the query is a row the
 * user cannot explain. A kind word matches too, so `method` lists the methods.
 */
export function structureRows(
	symbols: readonly LspSymbol[],
	query: string,
	cap = STRUCTURE_CAP,
): number[] {
	const needle = query.trim().toLowerCase();
	const out: number[] = [];
	for (let i = 0; i < symbols.length && out.length < cap; i += 1) {
		const symbol = symbols[i];
		if (needle !== "") {
			const name = symbol.name.toLowerCase();
			const kind = kindLabel(symbol.kind).toLowerCase();
			if (!name.includes(needle) && !kind.includes(needle)) continue;
		}
		out.push(i);
	}
	return out;
}

/** The row to highlight on open: the caret's symbol, else the first row. */
export function initialActive(rows: readonly number[], caretIndex: number): number {
	if (rows.length === 0) return 0;
	const at = caretIndex >= 0 ? rows.indexOf(caretIndex) : -1;
	return Math.max(at, 0);
}

/** The next row, wrapping at either end the way the other palettes do. */
export function stepActive(active: number, length: number, step: 1 | -1): number {
	if (length <= 0) return 0;
	return (((active + step) % length) + length) % length;
}

/** Why the popup has no list at all, decided before any request is sent. */
export type StructureSource = "no-file" | "no-server" | "ready";

export function structureSource(path: string | null, session: string | null): StructureSource {
	if (path === null) return "no-file";
	if (session === null) return "no-server";
	return "ready";
}

/**
 * The session that serves the popup's file.
 *
 * A server that is not `ready` is no server at all: naming a session for it would turn the popup's
 * "no language server" line into an unknown-session error from the backend.
 */
export function structureSession(
	root: string | null,
	path: string | null,
	states: LspStatusMap,
): string | null {
	if (root === null || path === null) return null;
	const running = new Set<ServerKind>();
	for (const kind of ALL_SERVER_KINDS) {
		if (states[kind].phase === "ready") running.add(kind);
	}
	const kind = servedByRunningServer(path, running);
	return kind === null ? null : sessionId(kind, root);
}

export type StructureStatus = { text: string; tone: "info" | "error" } | null;

/**
 * The one line the popup shows instead of a list, or null when it has rows.
 *
 * Each state names its own cause: an empty box would leave "no file", "no server" and "the server
 * returned nothing" indistinguishable, and they need different fixes.
 */
export function structureStatus(input: {
	source: StructureSource;
	loading: boolean;
	error: string | null;
	symbolCount: number;
	rowCount: number;
}): StructureStatus {
	if (input.source === "no-file") return { text: "No file open.", tone: "info" };
	if (input.source === "no-server")
		return { text: "No language server for this file.", tone: "info" };
	if (input.error !== null) return { text: input.error, tone: "error" };
	if (input.loading && input.symbolCount === 0) return { text: "loading symbols…", tone: "info" };
	if (input.symbolCount === 0) {
		return { text: "The language server returned no symbols for this file.", tone: "info" };
	}
	if (input.rowCount === 0) return { text: "No symbol matches.", tone: "info" };
	return null;
}
