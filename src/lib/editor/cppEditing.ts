import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension, type Transaction } from "@codemirror/state";

/**
 * The C/C++ typing rules a grammar does not give you.
 *
 * Two things CLion does that the Lezer grammar has no opinion about: an access specifier belongs at
 * the class's own indent rather than one level in with the members, and a class, struct, union or
 * enum ends with a semicolon, which is easy to forget because every other brace pair in the language
 * does not.
 */

/** Access specifiers, including the Qt spellings that mean the same thing. */
const ACCESS_SPECIFIER = /^(\s*)(?:public|private|protected|signals|slots|Q_SIGNALS|Q_SLOTS)\s*:/;

const SCOPE_SPECIFIERS = new Set([
	"ClassSpecifier",
	"StructSpecifier",
	"UnionSpecifier",
	"EnumSpecifier",
]);

/** The indentation of the class-like scope a position sits in, or null when it sits in none. */
export function scopeIndentAt(state: EditorState, pos: number): number | null {
	let node: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(state).resolveInner(
		Math.min(pos, state.doc.length),
		1,
	);
	for (; node !== null; node = node.parent) {
		if (!SCOPE_SPECIFIERS.has(node.name)) continue;
		const line = state.doc.lineAt(node.from);
		return line.text.length - line.text.trimStart().length;
	}
	return null;
}

/** Whether a `}` at `pos` (just past the brace) is the one that closes a class-like scope. */
export function closesScopeAt(state: EditorState, pos: number): boolean {
	let node: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(state).resolveInner(
		pos - 1,
		-1,
	);
	for (; node !== null; node = node.parent) {
		if (!SCOPE_SPECIFIERS.has(node.name)) continue;
		return node.to === pos;
	}
	return false;
}

type Edit = { from: number; to?: number; insert: string };

/**
 * The edits one typed change implies beyond the character itself.
 *
 * A re-indent replaces the line's leading whitespace instead of inserting before it, so repeated
 * typing cannot stack spaces. The semicolon is only added when nothing but whitespace follows the
 * brace, which leaves `struct X { } x;` and an already-typed `};` alone.
 */
export function cppEdits(transaction: Transaction): Edit[] {
	if (!transaction.docChanged) return [];
	const state = transaction.state;
	const edits: Edit[] = [];
	const seen = new Set<number>();
	transaction.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
		const text = inserted.toString();

		if (text === "}") {
			const after = toB;
			if (closesScopeAt(state, after) && state.doc.sliceString(after, after + 1) !== ";") {
				edits.push({ from: after, insert: ";" });
			}
		}

		if (!text.includes(":")) return;
		const line = state.doc.lineAt(fromB);
		if (seen.has(line.from)) return;
		const match = ACCESS_SPECIFIER.exec(line.text);
		if (match === null) return;
		const indent = scopeIndentAt(state, line.from);
		if (indent === null) return;
		const current = match[1].length;
		if (current === indent) return;
		seen.add(line.from);
		edits.push({ from: line.from, to: line.from + current, insert: " ".repeat(indent) });
	});
	return edits;
}

/** Access-specifier alignment and auto-semicolons, applied to typing only. */
export function cppEditing(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
		const edits = cppEdits(transaction);
		if (edits.length === 0) return transaction;
		return [
			transaction,
			{
				changes: edits,
				sequential: true,
			},
		];
	});
}
