import { describe, expect, mock, test } from "bun:test";

const lspCompletion = mock(async () => ({ items: [] }));

mock.module("@/lib/project/api", () => ({ lspCompletion }));

import { CompletionContext } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { rust } from "@codemirror/lang-rust";
import { EditorState } from "@codemirror/state";
import { createCompletionSource } from "@/lib/editor/completionSource";
import type { ServerKind } from "@/lib/lsp/served";

/** A parsed Rust document, so the source reads a real syntax tree rather than an empty one. */
function parsed(doc: string): EditorState {
	const state = EditorState.create({ doc, extensions: [rust()] });
	ensureSyntaxTree(state, doc.length, 5000);
	return state;
}

function deps(running: ServerKind[] = ["rust-analyzer"]) {
	return {
		rootRef: { current: "/p" },
		latestRef: { current: { path: "/p/main.rs" } },
		runningRef: { current: new Set(running) },
		completionSeq: 0,
	};
}

const at = (state: EditorState, pos: number, explicit = false) =>
	new CompletionContext(state, pos, explicit);

describe("createCompletionSource", () => {
	test("a caret in a comment asks the server nothing", async () => {
		lspCompletion.mockClear();
		const state = parsed("// note");
		const source = createCompletionSource(deps());
		expect(await source(at(state, state.doc.length))).toBeNull();
		expect(lspCompletion).not.toHaveBeenCalled();
	});

	test("a caret in a string literal asks the server nothing", async () => {
		lspCompletion.mockClear();
		const state = parsed('fn main() { let s = "hi"; }');
		const source = createCompletionSource(deps());
		const inside = state.doc.toString().indexOf('"hi"') + 2;
		expect(await source(at(state, inside))).toBeNull();
		expect(lspCompletion).not.toHaveBeenCalled();
	});

	test("a file no running server serves still gets nothing", async () => {
		lspCompletion.mockClear();
		const state = parsed("let x = 1;");
		const source = createCompletionSource(deps([]));
		expect(await source(at(state, state.doc.length))).toBeNull();
		expect(lspCompletion).not.toHaveBeenCalled();
	});
});
