import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { lspSemanticTokens, type SemanticToken } from "@/lib/project/api";
import { sessionForContext } from "@/lib/lsp/context";

/** How long after the last keystroke the tokens are asked for again. */
const REFRESH_MS = 400;

/**
 * The class a token kind is drawn with, or null when the grammar already colours it.
 *
 * Keywords, comments, strings and numbers are the syntax highlighter's job; a semantic token only
 * earns a class where the grammar cannot know: a name is a function, a type, a macro, a parameter or
 * one of the several kinds of variable. Colouring everything here would make the file louder, not
 * clearer.
 *
 * The categories are CLion's, and the modifiers clangd sends are enough to fill them: `classScope`
 * is a member, `static` is the storage a member was declared with, `readonly` is a constant, and
 * `functionScope`/`fileScope`/`globalScope` are where a variable lives. Measured against clangd's
 * own legend and tokens, not assumed.
 */
export function semanticClass(token: SemanticToken): string | null {
	const modifiers = token.modifiers;
	// clangd answers `auto` with an `enum` token carrying `deduced`. Painting a placeholder keyword
	// like an enum constant would be worse than leaving it to the grammar.
	if (token.kind === "enum" && modifiers.includes("deduced")) return null;
	switch (token.kind) {
		case "function":
		case "method":
			return modifiers.includes("declaration") ? "cm-sem-function-decl" : "cm-sem-function";
		case "type":
		case "class":
		case "struct":
		case "enum":
		case "interface":
		case "namespace":
		case "typeParameter":
			return "cm-sem-type";
		case "enumMember":
			return "cm-sem-enum";
		case "macro":
			return "cm-sem-macro";
		case "parameter":
			return "cm-sem-parameter";
		case "label":
			return "cm-sem-label";
		case "property":
			// An instance member; clangd reports a static member as a variable, below.
			return "cm-sem-property";
		case "variable":
			// A constant is a variable that cannot be written to, at any scope; a static member is a
			// variable at class scope; a global or file-scope variable is neither. A local keeps the
			// base identifier colour, which is what a grammar would have drawn anyway.
			if (modifiers.includes("readonly")) return "cm-sem-constant";
			if (modifiers.includes("static") && modifiers.includes("classScope")) {
				return "cm-sem-static-field";
			}
			if (modifiers.includes("globalScope") || modifiers.includes("fileScope")) {
				return "cm-sem-global";
			}
			return null;
		default:
			return null;
	}
}

/** Tokens as decorations. An out-of-range position marks nothing rather than throwing. */
export function decorationsFor(
	doc: { line: (number: number) => { from: number; to: number } | null; lines: number },
	tokens: readonly SemanticToken[],
): DecorationSet {
	const marks: Array<{ from: number; to: number; cls: string }> = [];
	for (const token of tokens) {
		const cls = semanticClass(token);
		if (cls === null) continue;
		if (token.line + 1 > doc.lines) continue;
		const line = doc.line(token.line + 1);
		if (line === null) continue;
		const from = line.from + token.start;
		const to = Math.min(from + token.length, line.to);
		if (to <= from) continue;
		marks.push({ from, to, cls });
	}
	return Decoration.set(
		marks.map((mark) => Decoration.mark({ class: mark.cls }).range(mark.from, mark.to)),
		true,
	);
}

const setSemantic = StateEffect.define<DecorationSet>();

const semanticField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setSemantic)) return effect.value;
		}
		return value.map(transaction.changes);
	},
	provide: (field) => EditorView.decorations.from(field),
});

/**
 * Semantic highlighting over whatever the language server knows.
 *
 * A grammar sees `student_ptr` as a name; clangd knows it is a variable, that `printf` is a function
 * and that `StudentType` is a type. The tokens are asked for when the file changes and when the view
 * settles, never per keystroke, and a stale answer is dropped by sequence number.
 */
export function semanticTokens(options: {
	pathRef: { current: string | null };
	enabled: boolean;
}): Extension {
	if (!options.enabled) return [];
	return [
		semanticField,
		ViewPlugin.fromClass(
			class {
				private timer: number | null = null;
				private seq = 0;

				constructor(private readonly view: EditorView) {
					this.schedule(120);
				}

				update(update: ViewUpdate) {
					if (update.docChanged) this.schedule(REFRESH_MS);
				}

				destroy() {
					if (this.timer !== null) window.clearTimeout(this.timer);
				}

				private schedule(delay: number) {
					if (this.timer !== null) window.clearTimeout(this.timer);
					this.timer = window.setTimeout(() => {
						this.timer = null;
						void this.refresh();
					}, delay);
				}

				private async refresh() {
					const path = options.pathRef.current;
					if (path === null) return;
					const session = sessionForContext(path);
					if (session === null) return;
					const ticket = ++this.seq;
					let tokens: SemanticToken[];
					try {
						tokens = await lspSemanticTokens(session, path);
					} catch {
						// A server without semantic tokens, or one that just stopped: keep the grammar's colours.
						return;
					}
					if (ticket !== this.seq) return;
					const doc = this.view.state.doc;
					this.view.dispatch({
						effects: setSemantic.of(
							decorationsFor(
								{
									lines: doc.lines,
									line: (number: number) =>
										number >= 1 && number <= doc.lines
											? doc.line(number)
											: null,
								},
								tokens,
							),
						),
					});
				}
			},
		),
	];
}
