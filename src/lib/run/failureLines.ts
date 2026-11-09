import type { Diagnostic } from "@/lib/project/api";
import { relativeTo } from "@/lib/project/paths";

/** Why a launch never started: the build that failed, or the target that could not be resolved. */
export type LaunchFailure = {
	stage: "build" | "resolve";
	message: string;
	diagnostics: Diagnostic[];
};

const SEVERITY: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

/** A path as the compiler would print it: relative to the project when it is inside it. */
function displayPath(path: string, root: string | null): string {
	if (root === null) return path;
	return relativeTo(root, path) ?? path;
}

/**
 * What the Run console shows when a launch fails.
 *
 * The build's summary is one line and the compiler's own message is the part worth reading, so the
 * diagnostics are listed underneath in the `file:line:column: error: message` shape every other
 * toolchain prints. Positions are shown 1-based because that is what the editor's gutter says.
 */
export function launchFailureLines(failure: LaunchFailure, root: string | null): string[] {
	const head = `${failure.stage} failed`;
	const lines = failure.message.trim() === "" ? [head] : [`${head}: ${failure.message}`];
	const diagnostics = [...failure.diagnostics].sort(
		(left, right) =>
			left.range.start.line - right.range.start.line ||
			left.range.start.character - right.range.start.character,
	);
	for (const diagnostic of diagnostics) {
		const path = displayPath(diagnostic.path, root);
		const line = diagnostic.range.start.line + 1;
		const column = diagnostic.range.start.character + 1;
		lines.push(
			`${path}:${line}:${column}: ${SEVERITY[diagnostic.severity]}: ${diagnostic.message}`,
		);
	}
	if (diagnostics.length === 0 && failure.stage === "build") {
		lines.push("the build reported no diagnostics, so only its summary is above");
	}
	return lines;
}
