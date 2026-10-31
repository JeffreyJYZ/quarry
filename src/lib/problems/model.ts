import type { DiagnosticMap } from "@/lib/lsp/diagnostics";
import type { Diagnostic } from "@/lib/project/api";

export type ProblemFile = {
	/** Absolute path, the key the diagnostics store uses. */
	path: string;
	/** Last path segment, what the row header shows. */
	name: string;
	diagnostics: Diagnostic[];
};

export function fileName(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? path : path.slice(cut + 1);
}

export function directoryOf(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? "" : path.slice(0, cut);
}

/** `2 errors`, `1 error`; keeps every surface reading the same. */
export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export type SeverityName = "error" | "warning" | "info" | "hint";

export function severityName(severity: Diagnostic["severity"]): SeverityName {
	if (severity === 1) return "error";
	if (severity === 2) return "warning";
	if (severity === 3) return "info";
	return "hint";
}

export function filterDiagnostics(
	diagnostics: Diagnostic[],
	allowed: ReadonlySet<number>,
): Diagnostic[] {
	return diagnostics.filter((diagnostic) => allowed.has(diagnostic.severity));
}

export function matchesProblemText(
	diagnostic: Diagnostic,
	path: string,
	name: string,
	query: string,
): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	const haystack =
		`${path} ${name} ${diagnostic.message} ${diagnostic.source ?? ""}`.toLowerCase();
	return haystack.includes(needle);
}

export function filterProblemFiles(
	files: ProblemFile[],
	allowed: ReadonlySet<number>,
	query: string = "",
): ProblemFile[] {
	const result: ProblemFile[] = [];
	for (const file of files) {
		const diagnostics = file.diagnostics.filter(
			(diagnostic) =>
				allowed.has(diagnostic.severity) &&
				matchesProblemText(diagnostic, file.path, file.name, query),
		);
		if (diagnostics.length > 0) {
			result.push({ path: file.path, name: file.name, diagnostics });
		}
	}
	return result;
}

export type FlatProblem = { path: string; name: string; diagnostic: Diagnostic };

export function flatProblems(
	files: ProblemFile[],
	allowed: ReadonlySet<number>,
	query: string = "",
): FlatProblem[] {
	const rows: FlatProblem[] = [];
	for (const file of files) {
		for (const diagnostic of file.diagnostics) {
			if (!allowed.has(diagnostic.severity)) continue;
			if (!matchesProblemText(diagnostic, file.path, file.name, query)) continue;
			rows.push({ path: file.path, name: file.name, diagnostic });
		}
	}
	rows.sort((left, right) => {
		const severity = left.diagnostic.severity - right.diagnostic.severity;
		if (severity !== 0) return severity;
		const path = left.path.localeCompare(right.path);
		if (path !== 0) return path;
		return left.diagnostic.range.start.line - right.diagnostic.range.start.line;
	});
	return rows;
}

export function copyLine(path: string, diagnostic: Diagnostic): string {
	const { line, character } = diagnostic.range.start;
	return `${path}:${line + 1}:${character + 1} ${severityName(diagnostic.severity)}: ${diagnostic.message}`;
}

/** Files that carry a problem, errors before warnings, then by path. */
export function problemFiles(map: DiagnosticMap): ProblemFile[] {
	const files: ProblemFile[] = [];
	for (const [path, diagnostics] of map) {
		if (diagnostics.length > 0) {
			files.push({ path, name: fileName(path), diagnostics });
		}
	}
	files.sort((left, right) => worst(left) - worst(right) || left.path.localeCompare(right.path));
	return files;
}

function worst(file: ProblemFile): number {
	for (const diagnostic of file.diagnostics) {
		if (diagnostic.severity === 1) {
			return 1;
		}
		if (diagnostic.severity === 2) {
			return 2;
		}
	}
	return 3;
}
