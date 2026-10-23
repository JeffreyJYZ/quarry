import type { Diagnostic as LintDiagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { Diagnostic, Position } from "@/lib/project/api";

/** LSP severity numbers mapped onto the lint package's names. */
const SEVERITY: Record<Diagnostic["severity"], LintDiagnostic["severity"]> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

/** Clamp a zero-based server position onto a document offset. */
function offsetAt(state: EditorState, position: Position): number {
	const lineNumber = Math.min(Math.max(position.line + 1, 1), state.doc.lines);
	const line = state.doc.line(lineNumber);
	const character = Math.min(Math.max(position.character, 0), line.length);
	return line.from + character;
}

/** Build the lint package's shape for one server diagnostic. */
function mapDiagnostic(state: EditorState, diagnostic: Diagnostic): LintDiagnostic {
	const from = offsetAt(state, diagnostic.range.start);
	const end = offsetAt(state, diagnostic.range.end);
	let to = Math.max(end, from);
	// A zero-width range draws nothing, so widen it onto the next character when the line has room.
	if (to === from && from < state.doc.lineAt(from).to) to = from + 1;
	const mapped: LintDiagnostic = {
		from,
		to,
		severity: SEVERITY[diagnostic.severity],
		message: diagnostic.message,
	};
	if (diagnostic.source !== null) mapped.source = diagnostic.source;
	return mapped;
}

/** All server diagnostics for the current document, in the lint package's shape. */
export function toLintDiagnostics(
	state: EditorState,
	diagnostics: readonly Diagnostic[] | undefined,
): LintDiagnostic[] {
	if (diagnostics === undefined || diagnostics.length === 0) return [];
	return diagnostics.map((diagnostic) => mapDiagnostic(state, diagnostic));
}

/** Stable text for one published set, so an unchanged list does not dispatch a transaction. */
export function lintSignature(diagnostics: readonly LintDiagnostic[]): string {
	return diagnostics
		.map(
			({ from, to, severity, source, message }) =>
				`${from}:${to}:${severity}:${source ?? ""}:${message}`,
		)
		.join("\n");
}
