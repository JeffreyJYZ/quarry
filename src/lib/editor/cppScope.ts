import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/**
 * Where a position sits in the C++ tree, which is what the typing rules are built on.
 *
 * Every query reads `EditorState` as given: the caller passes the state the transaction produces, so
 * a position here and a position in the plan are the same coordinate system.
 */

/** Access specifiers, including the Qt spellings that mean the same thing. */
export const ACCESS_SPECIFIER =
	/^(\s*)(?:public|private|protected|signals|slots|Q_SIGNALS|Q_SLOTS)\s*:/;

const SCOPE_SPECIFIERS = new Set([
	"ClassSpecifier",
	"StructSpecifier",
	"UnionSpecifier",
	"EnumSpecifier",
]);

/** A `}` below the caret, with nothing but whitespace (up to two blank line breaks) in between. */
export const WAITING_BRACE = /^[ \t]*(?:\r?\n[ \t]*){0,2}\}/;

type Node = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

function walk(pos: number, state: EditorState, side: -1 | 1): Node {
	return syntaxTree(state).resolveInner(Math.min(pos, state.doc.length), side);
}

export const lineIndent = (state: EditorState, pos: number): number => {
	const line = state.doc.lineAt(pos);
	return line.text.length - line.text.trimStart().length;
};

/** The indentation of the class-like scope a position sits in, or null when it sits in none. */
export function scopeIndentAt(state: EditorState, pos: number): number | null {
	for (let node: Node | null = walk(pos, state, 1); node !== null; node = node.parent) {
		if (SCOPE_SPECIFIERS.has(node.name)) return lineIndent(state, node.from);
	}
	return null;
}

/** Whether a `}` at `pos` (just past the brace) is the one that closes a class-like scope. */
export function closesScopeAt(state: EditorState, pos: number): boolean {
	for (let node: Node | null = walk(pos - 1, state, -1); node !== null; node = node.parent) {
		if (SCOPE_SPECIFIERS.has(node.name)) return node.to === pos;
	}
	return false;
}

/** The indent of the line holding the `{` that a `}` just past `brace` closes. */
export function openerIndentAt(state: EditorState, brace: number): number | null {
	for (let node: Node | null = walk(brace - 1, state, -1); node !== null; node = node.parent) {
		if (state.doc.sliceString(node.from, node.from + 1) === "{")
			return lineIndent(state, node.from);
	}
	return null;
}

/**
 * The semicolon a class header earns the moment its closing brace is auto-filled.
 *
 * `closeBrackets` puts the `}` there when `{` is typed, and that brace is usually the one that stays:
 * nobody types it a second time at the end of the class. So the `;` has to arrive with it, at the
 * moment the pair is complete. Returns the position after the brace, or null when the pair is not a
 * class-like scope, so a function or namespace body stays untouched.
 */
export function autoClosedScopeEnd(state: EditorState, caret: number): number | null {
	if (state.doc.sliceString(caret - 1, caret) !== "{") return null;
	if (state.doc.sliceString(caret, caret + 1) !== "}") return null;
	const after = caret + 1;
	if (!closesScopeAt(state, after)) return null;
	if (state.doc.sliceString(after, after + 1) === ";") return null;
	return state.doc.sliceString(after, state.doc.lineAt(after).to).trim() === "" ? after : null;
}
