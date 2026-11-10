import { describe, expect, test } from "bun:test";
import { cpp } from "@codemirror/lang-cpp";
import { ensureSyntaxTree } from "@codemirror/language";
import { rust } from "@codemirror/lang-rust";
import { EditorState } from "@codemirror/state";
import { inCommentOrString } from "@/lib/editor/commentString";

/** A parsed document, so the helper reads real nodes instead of an unparsed stub tree. */
function parsed(doc: string, language: ReturnType<typeof rust>): EditorState {
	const state = EditorState.create({ doc, extensions: [language] });
	ensureSyntaxTree(state, doc.length, 5000);
	return state;
}

/** The caret just after `marker`, which is where a keystroke put it. */
const after = (state: EditorState, marker: string): number =>
	state.doc.toString().indexOf(marker) + marker.length;

describe("inCommentOrString", () => {
	test("a caret at the end of a line comment is in it", () => {
		const state = parsed("// a note", rust());
		expect(inCommentOrString(state, state.doc.length)).toBe(true);
	});

	test("a caret inside a C++ block comment is in it", () => {
		const state = parsed("/* block */", cpp());
		expect(inCommentOrString(state, 5)).toBe(true);
	});

	test("a caret inside a Rust string literal is in it", () => {
		const state = parsed('fn main() { let s = "hi"; }', rust());
		expect(inCommentOrString(state, state.doc.toString().indexOf("hi") + 1)).toBe(true);
	});

	test("a caret inside a C++ string literal is in it", () => {
		const state = parsed('const char* s = "hello";', cpp());
		expect(inCommentOrString(state, state.doc.toString().indexOf("hello") + 2)).toBe(true);
	});

	test("a caret on an identifier is in code, not in either", () => {
		const state = parsed("fn main() { let s = 1; }", rust());
		expect(inCommentOrString(state, after(state, "let s"))).toBe(false);
	});

	test("a document with no language has no node to match, so it is code", () => {
		const state = EditorState.create({ doc: "// not parsed as Rust" });
		expect(inCommentOrString(state, state.doc.length)).toBe(false);
	});

	test("an empty document is code", () => {
		const state = parsed("", rust());
		expect(inCommentOrString(state, 0)).toBe(false);
	});
});
