import type { Diagnostic } from "@/lib/project/api";

/** Diagnostics per absolute path, merged from the language server and from builds. */
export type DiagnosticMap = Map<string, Diagnostic[]>;

export type SeverityCounts = { errors: number; warnings: number };

/** Stable identity for one problem: two sources reporting the same span and text are one row. */
export function diagnosticKey(diagnostic: Diagnostic): string {
	const { start, end } = diagnostic.range;
	return [
		diagnostic.severity,
		`${start.line}:${start.character}-${end.line}:${end.character}`,
		diagnostic.source ?? "",
		diagnostic.message,
	].join("|");
}

/** Errors first, then by position, so every surface lists problems in the same order. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			left.severity - right.severity ||
			left.range.start.line - right.range.start.line ||
			left.range.start.character - right.range.start.character ||
			left.message.localeCompare(right.message),
	);
}

/** Replace one file's server-sourced diagnostics; an empty publish clears them. */
export function withServerDiagnostics(
	current: DiagnosticMap,
	path: string,
	diagnostics: Diagnostic[],
): DiagnosticMap {
	const next = new Map(current);
	if (diagnostics.length === 0) {
		next.delete(path);
	} else {
		next.set(path, sortDiagnostics(diagnostics));
	}
	return next;
}

/**
 * Group a build report's diagnostics by file. A rebuild replaces the whole build map, which drops
 * every stale build entry while leaving the server's own entries untouched.
 */
export function groupDiagnostics(diagnostics: Diagnostic[]): DiagnosticMap {
	const grouped = new Map<string, Diagnostic[]>();
	for (const diagnostic of diagnostics) {
		const existing = grouped.get(diagnostic.path);
		if (existing === undefined) {
			grouped.set(diagnostic.path, [diagnostic]);
		} else {
			existing.push(diagnostic);
		}
	}
	for (const [path, list] of grouped) {
		grouped.set(path, sortDiagnostics(list));
	}
	return grouped;
}

export function combineDiagnostics(server: DiagnosticMap, build: DiagnosticMap): DiagnosticMap {
	const next = new Map<string, Diagnostic[]>();
	for (const [path, list] of server) {
		if (list.length > 0) {
			next.set(path, list);
		}
	}
	for (const [path, list] of build) {
		if (list.length === 0) {
			continue;
		}
		const existing = next.get(path) ?? [];
		const seen = new Set(existing.map(diagnosticKey));
		const merged = [...existing];
		for (const diagnostic of list) {
			const key = diagnosticKey(diagnostic);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			merged.push(diagnostic);
		}
		next.set(path, sortDiagnostics(merged));
	}
	return next;
}

export function countSeverities(map: DiagnosticMap): SeverityCounts {
	let errors = 0;
	let warnings = 0;
	for (const list of map.values()) {
		for (const diagnostic of list) {
			if (diagnostic.severity === 1) {
				errors += 1;
			} else if (diagnostic.severity === 2) {
				warnings += 1;
			}
		}
	}
	return { errors, warnings };
}
