import { EditorState, type Extension } from "@codemirror/state";
import { boundedPlan, cppPlan } from "@/lib/editor/cppPlan";

export { autoClosedScopeEnd, closesScopeAt, scopeIndentAt } from "@/lib/editor/cppScope";
export { boundedPlan, cppPlan } from "@/lib/editor/cppPlan";
export type { CppPlan, Edit } from "@/lib/editor/cppPlan";

/**
 * Access-specifier alignment, brace alignment and auto-semicolons, applied to typing only.
 *
 * A stepped-over brace arrives as a change that rewrites the character with itself, so a typed `}`
 * is recognised from the inserted text rather than from the document changing size.
 *
 * The plan is measured on the document this transaction produces, so its positions are positions in
 * that document and the second spec is `sequential`: CodeMirror composes it against the keystroke's
 * own text. `boundedPlan` then keeps a mis-measured edit from ever leaving the document, because a
 * `RangeError` out of `dispatch` is a dead workspace, not a cosmetic glitch.
 */
export function cppEditing(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.isUserEvent("input.type")) return transaction;
		const plan = boundedPlan(cppPlan(transaction), transaction.changes.newLength);
		if (plan.edits.length === 0) return transaction;
		return [
			transaction,
			{
				changes: plan.edits,
				selection: plan.selection === undefined ? undefined : { anchor: plan.selection },
				sequential: true,
			},
		];
	});
}
