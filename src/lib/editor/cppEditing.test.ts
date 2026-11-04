import { describe, expect, test } from "bun:test";
import { cpp } from "@codemirror/lang-cpp";
import { EditorState } from "@codemirror/state";
import { cppEditing, closesScopeAt, scopeIndentAt } from "@/lib/editor/cppEditing";

const stateFor = (doc: string) => EditorState.create({ doc, extensions: [cpp(), cppEditing()] });

/** Type `text` at `pos`, as a keystroke arrives. */
function type(state: EditorState, pos: number, text: string): string {
	return state
		.update({
			changes: { from: pos, insert: text },
			selection: { anchor: pos + text.length },
			userEvent: "input.type",
		})
		.state.doc.toString();
}

const typeAfter = (state: EditorState, marker: string, text: string): string =>
	type(state, state.doc.toString().indexOf(marker) + marker.length, text);

const typeAtEnd = (state: EditorState, text: string): string => type(state, state.doc.length, text);

describe("cppEditing", () => {
	test("a class scope indent is the indent of the line that opens it", () => {
		const state = stateFor("namespace n {\n    class W {\n        int x;\n    };\n}\n");
		expect(scopeIndentAt(state, state.doc.toString().indexOf("int x"))).toBe(4);
	});

	test("a top-level class scope indent is zero", () => {
		const state = stateFor("class W {\n    int x;\n};\n");
		expect(scopeIndentAt(state, state.doc.toString().indexOf("int x"))).toBe(0);
	});

	test("typing the colon of an access specifier returns it to the class indent", () => {
		const state = stateFor("class W {\n    private\n};\n");
		expect(typeAfter(state, "private", ":")).toBe("class W {\nprivate:\n};\n");
	});

	test("a nested class dedents its specifier to the class, not the file", () => {
		const state = stateFor("namespace n {\n    class W {\n        public\n    };\n}\n");
		expect(typeAfter(state, "public", ":")).toBe(
			"namespace n {\n    class W {\n    public:\n    };\n}\n",
		);
	});

	test("a line that only looks like a specifier is left alone", () => {
		const state = stateFor("class W {\npublic:\n    int publication;\n};\n");
		const out = typeAfter(state, "publication", ":");
		expect(out).toBe("class W {\npublic:\n    int publication:;\n};\n");
	});

	test("closing a struct adds the semicolon", () => {
		const state = stateFor("struct P {\n    int v;\n\n");
		expect(typeAtEnd(state, "}")).toBe("struct P {\n    int v;\n\n};");
	});

	test("closing a class adds the semicolon", () => {
		const state = stateFor("class W {\n    int x;\n");
		expect(typeAtEnd(state, "}")).toBe("class W {\n    int x;\n};");
	});

	test("closing a function body adds nothing", () => {
		const state = stateFor("void f() {\n    int x = 1;\n");
		expect(typeAtEnd(state, "}")).toBe("void f() {\n    int x = 1;\n}");
	});

	test("closing a namespace adds nothing", () => {
		const state = stateFor("namespace n {\n    int x;\n");
		expect(typeAtEnd(state, "}")).toBe("namespace n {\n    int x;\n}");
	});

	test("a typed semicolon is not doubled", () => {
		const state = stateFor("struct P {\n    int v;\n");
		const one = typeAtEnd(state, "}");
		expect(one.endsWith("};")).toBe(true);
		const again = type(EditorState.create({ doc: one }), one.length - 1, "");
		expect(again.endsWith("};")).toBe(true);
	});

	test("the brace of an already-semicoloned struct is recognised", () => {
		const state = stateFor("struct P {\n    int v;\n};\n");
		const brace = state.doc.toString().indexOf("}");
		expect(closesScopeAt(state, brace + 1)).toBe(true);
	});
});
