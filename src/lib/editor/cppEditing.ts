import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension, type Transaction } from "@codemirror/state";

/**
 * The C/C++ typing rules a grammar does not give you.
 *
 * CLion puts an access specifier at the class's own indent, aligns a closing brace with the line that
 * opened it, and ends a class, struct, union or enum with a semicolon. `closeBrackets` also leaves a
 * `}` waiting one line below the caret, so a typed `}` on the indented blank line would duplicate it
 * rather than close the class; here the typed brace and the whitespace before the waiting one cancel
 * out, leaving a single brace at the right indent.
 */

/** Access specifiers, including the Qt spellings that mean the same thing. */
const ACCESS_SPECIFIER = /^(\s*)(?:public|private|protected|signals|slots|Q_SIGNALS|Q_SLOTS)\s*:/;

const SCOPE_SPECIFIERS = new Set([
	"ClassSpecifier",
	"StructSpecifier",
	"UnionSpecifier",
	"EnumSpecifier",
]);

/** A `}` below the caret, with nothing but whitespace (up to two blank line breaks) in between. */
const WAITING_BRACE = /^[ \t]*(?:\r?\n[ \t]*){0,2}\}/;

type Node = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

function walk(pos: number, state: EditorState, side: -1 | 1): Node {
	return syntaxTree(state).resolveInner(Math.min(pos, state.doc.length), side);
}

const lineIndent = (state: EditorState, pos: number): number => {
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

type Edit = { from: number; to?: number; insert: string };

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
 */
export function cppPlan(transaction: Transaction): CppPlan {
	const state = transaction.state;
	const edits: Edit[] = [];
	let selection: number | undefined;
	const seen = new Set<number>();

	transaction.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
		const text = inserted.toString();
		for (const plan of [text === "}" ? planForBrace(state, toB) : null]) {
			if (plan !== null && plan.edits.length > 0) {
				edits.push(...plan.edits);
				selection = plan.selection ?? selection;
			}
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
 * Access-specifier alignment, brace alignment and auto-semicolons, applied to typing only.
 *
 * A stepped-over brace arrives as a change that rewrites the character with itself, so a typed `}`
 * is recognised from the inserted text rather than from the document changing size.
 */
export function cppEditing(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.isUserEvent("input.type")) return transaction;
		const plan = cppPlan(transaction);
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
