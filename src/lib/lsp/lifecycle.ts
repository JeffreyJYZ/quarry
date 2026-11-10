/**
 * What a file or a session lifetime event means for a diagnostics map.
 *
 * Findings outlive the thing they describe unless something drops them: a closed document is never
 * guaranteed an empty publish, a server that exits never publishes again, and a rename leaves every
 * finding keyed under the path that no longer exists. The decision is pure so each case is a test;
 * `useDiagnosticsState` only applies the result.
 */

import {
	type DiagnosticMap,
	diagnosticKey,
	sortDiagnostics,
	withoutDiagnostics,
} from "@/lib/lsp/diagnostics";
import { type ServerKind, serverKindForPath } from "@/lib/lsp/served";

/**
 * Which map an event is applied to.
 *
 * A build finding describes the compiled program, not the tab that is open on it, so closing a file
 * or losing a language server leaves it alone; only a rename moves it, because that is the same
 * finding under a different name.
 */
export type DiagnosticsOrigin = "server" | "build";

export type DiagnosticsLifecycleEvent =
	/** The document was closed: its squiggles and its problems row go with it. */
	| { type: "close"; path: string }
	/** The buffer's text changed, so a build report about it describes text that is gone. */
	| { type: "text"; path: string }
	/** The server that published them is gone; `null` means every server. */
	| { type: "session-end"; kind: ServerKind | null }
	/** The file moved; the old key must never stay behind. */
	| { type: "rename"; from: string; to: string };

function withoutServer(current: DiagnosticMap, kind: ServerKind | null): DiagnosticMap {
	let changed = false;
	const next = new Map(current);
	for (const path of current.keys()) {
		if (kind === null || serverKindForPath(path) === kind) {
			next.delete(path);
			changed = true;
		}
	}
	return changed ? next : current;
}

/** Move one file's findings to the new path, merging whatever the server already published there. */
function moved(current: DiagnosticMap, from: string, to: string): DiagnosticMap {
	const findings = current.get(from);
	if (findings === undefined || from === to) return current;
	const next = new Map(current);
	next.delete(from);
	const existing = next.get(to) ?? [];
	const seen = new Set(existing.map(diagnosticKey));
	const merged = [...existing];
	for (const diagnostic of findings) {
		const key = diagnosticKey(diagnostic);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push({ ...diagnostic, path: to });
	}
	next.set(to, sortDiagnostics(merged));
	return next;
}

export function applyDiagnosticsEvent(
	current: DiagnosticMap,
	event: DiagnosticsLifecycleEvent,
	origin: DiagnosticsOrigin = "server",
): DiagnosticMap {
	if (event.type === "rename") return moved(current, event.from, event.to);
	// A build report describes the text it was compiled from, so a changed buffer leaves a build
	// finding describing text that is gone. The server follows the text live and keeps its rows.
	if (event.type === "text") {
		return origin === "build" ? withoutDiagnostics(current, event.path) : current;
	}
	if (origin === "build") return current;
	if (event.type === "close") return withoutDiagnostics(current, event.path);
	return withoutServer(current, event.kind);
}
