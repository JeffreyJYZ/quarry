import { ChangeSet, type EditorState, type Transaction } from "@codemirror/state";
import {
	ACCESS_SPECIFIER,
	autoClosedScopeEnd,
	closesScopeAt,
	lineIndent,
	openerIndentAt,
	scopeIndentAt,
	WAITING_BRACE,
} from "@/lib/editor/cppScope";

/**
 * The C/C++ typing rules a grammar does not give you, as a plan of edits.
 *
 * CLion puts an access specifier at the class's own indent, aligns a closing brace with the line that
 * opened it, and ends a class, struct, union or enum with a semicolon. `closeBrackets` also leaves a
 * `}` waiting one line below the caret, so a typed `}` on the indented blank line would duplicate it
 * rather than close the class; here the typed brace and the whitespace before the waiting one cancel
 * out, leaving a single brace at the right indent.
 *
 * Every position here is a position in `transaction.state`, the text the change produces, which is
 * also the text the caller applies the plan to. Nothing may be read from `transaction.startState`:
 * that is the document before the keystroke, and mixing the two is what puts a plan out of range.
 */

export type Edit = { from: number; to?: number; insert: string };

/** The edits a typing transaction implies, and where the caret should end up. */
export type CppPlan = { edits: Edit[]; selection?: number };

function planForBrace(state: EditorState, typedAt: number): CppPlan | null {
	const typed = typedAt - 1;
	if (state.doc.sliceString(typed, typedAt) !== "}") return null;
	const line = state.doc.lineAt(typedAt);
	const beforeCaret = state.doc.sliceString(line.from, typed);
	const waiting = WAITING_BRACE.exec(state.doc.sliceString(typedAt));

	// The closing brace is already below: the typed brace and the gap disappear, and the waiting one
	// takes the class's indent. The typed brace is the one the parser paired, so both the indent and
	// the semicolon are read from it — the waiting brace sits outside the recovered tree.
	if (waiting !== null && beforeCaret.trim() === "") {
		const brace = typedAt + waiting[0].length - 1;
		const indent = openerIndentAt(state, typedAt) ?? lineIndent(state, line.from);
		const semicolon = closesScopeAt(state, typedAt) ? ";" : "";
		return {
			edits: [
				{
					from: line.from,
					to: brace + 1,
					insert: `${" ".repeat(indent)}${semicolon === "" ? "}" : "};"}`,
				},
			],
			selection: line.from + indent + 1 + semicolon.length,
		};
	}

	// Otherwise the brace ends its line: align it with the opener when it stands alone, and give the
	// scope its semicolon — inline after `class A {` is the same closing brace as one on its own line.
	const indent = openerIndentAt(state, typedAt);
	const rest = state.doc.sliceString(typedAt, line.to);
	const edits: Edit[] = [];
	if (rest.trim() !== "") return { edits };
	const aligned = indent ?? beforeCaret.length;
	if (beforeCaret.trim() === "" && aligned !== beforeCaret.length) {
		edits.push({ from: line.from, to: typed, insert: " ".repeat(aligned) });
	}
	const brace = line.from + (beforeCaret.trim() === "" ? aligned : beforeCaret.length);
	if (!closesScopeAt(state, typedAt)) return { edits, selection: brace + 1 };
	if (state.doc.sliceString(typedAt, typedAt + 1) === ";") return { edits, selection: brace + 1 };
	edits.push({ from: typedAt, insert: ";" });
	return { edits, selection: brace + 2 };
}

/**
 * The edits one typing transaction implies beyond the character itself.
 *
 * A re-indent replaces the line's leading whitespace instead of inserting before it, so repeated
 * typing cannot stack spaces.
 *
 * Every position is read from the document the transaction produces, so a plan is measured on the
 * text it will be applied to. A transaction with more than one change plans each of them against the
 * whole document, which is why the extension's guard exists: such a plan can overlap itself.
 */
export function cppPlan(transaction: Transaction): CppPlan {
	const state = transaction.state;
	const edits: Edit[] = [];
	let selection: number | undefined;
	const seen = new Set<number>();

	transaction.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
		const text = inserted.toString();
		if (text.endsWith("{") || text.endsWith("{}")) {
			// `closeBrackets` inserts the pair as one `{}` change, so the caret sits between them.
			const caret = text.endsWith("{}") ? toB - 1 : toB;
			const end = autoClosedScopeEnd(state, caret);
			if (end !== null) edits.push({ from: end, insert: ";" });
		}
		const brace = text === "}" ? planForBrace(state, toB) : null;
		if (brace !== null && brace.edits.length > 0) {
			edits.push(...brace.edits);
			selection = brace.selection ?? selection;
		}
		if (!text.includes(":")) return;
		const line = state.doc.lineAt(fromB);
		if (seen.has(line.from)) return;
		const match = ACCESS_SPECIFIER.exec(line.text);
		if (match === null) return;
		const indent = scopeIndentAt(state, line.from);
		if (indent === null || match[1].length === indent) return;
		seen.add(line.from);
		edits.push({
			from: line.from,
			to: line.from + match[1].length,
			insert: " ".repeat(indent),
		});
	});
	return { edits, selection };
}

/**
 * The plan with every position clipped to the document it will be applied to.
 *
 * `cppPlan` measures the text the transaction produces and the extension applies the plan
 * sequentially, against that same text. That is the contract; this is the belt to its braces. A
 * heuristic that mis-measures one character must never dispatch a change outside the document:
 * CodeMirror answers that with a `RangeError` ("Position N is out of range for changeset of length
 * M") thrown out of `dispatch`, and an uncaught one there takes the whole workspace down through the
 * error boundary. So an edit past the end is dropped and a caret past the end is clamped.
 */
export function boundedPlan(plan: CppPlan, length: number): CppPlan {
	const edits = plan.edits.filter(
		(edit) => edit.from >= 0 && edit.from <= length && (edit.to ?? edit.from) <= length,
	);
	if (edits.length === 0 || plan.selection === undefined) return { edits };
	const final = ChangeSet.of(edits, length).newLength;
	return { edits, selection: Math.min(Math.max(plan.selection, 0), final) };
}
