import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/**
 * Whether the caret sits in a comment or a string literal.
 *
 * Read from the editor's own tree rather than the line's text, because `//` inside a string, a URL
 * in a comment and an escaped quote all defeat a text scan. Both grammars this app ships keep the
 * word in the node's name — Rust's `LineComment`, `BlockComment` and `String`, C++'s `LineComment`,
 * `BlockComment` and `String` — so the walk matches case-insensitively instead of listing every
 * parser's spelling. A file with no language, or a tree that has not parsed far enough, has no such
 * node: the walk finds nothing and answers false, which leaves completion behaving as before.
 */

const NON_CODE = /comment|string/i;

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

/** Whether `pos` is inside a comment or a string literal. */
export function inCommentOrString(state: EditorState, pos: number): boolean {
	const tree = syntaxTree(state);
	if (tree.length === 0) return false;
	const clamped = Math.min(pos, state.doc.length);
	for (
		let node: SyntaxNode | null = tree.resolveInner(clamped, -1);
		node !== null;
		node = node.parent
	) {
		if (NON_CODE.test(node.name)) return true;
	}
	return false;
}
