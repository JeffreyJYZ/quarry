import type { DiagnosticMap } from "@/lsp/diagnostics";
import type { Diagnostic } from "@/project/api";

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
