import { describe, expect, test } from "bun:test";
import { closeBrackets } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { EditorState } from "@codemirror/state";
import { boundedPlan, closesScopeAt, cppEditing, scopeIndentAt } from "@/lib/editor/cppEditing";

const stateFor = (doc: string) =>
	EditorState.create({ doc, extensions: [cpp(), closeBrackets(), cppEditing()] });

/** Type `text` at `pos`, as a keystroke arrives. */
function type(state: EditorState, pos: number, text: string): EditorState {
	return state.update({
		changes: { from: pos, insert: text },
		selection: { anchor: pos + text.length },
		userEvent: "input.type",
	}).state;
}

const typeAfter = (state: EditorState, marker: string, text: string): EditorState =>
	type(state, state.doc.toString().indexOf(marker) + marker.length, text);

const typeAtEnd = (state: EditorState, text: string): EditorState =>
	type(state, state.doc.length, text);

describe("cppEditing", () => {
	test("a class scope indent is the indent of the line that opens it", () => {
		const state = stateFor("namespace n {\n    class W {\n        int x;\n    };\n}\n");
		expect(scopeIndentAt(state, state.doc.toString().indexOf("int x"))).toBe(4);
	});

	test("typing the colon of an access specifier returns it to the class indent", () => {
		const state = stateFor("class W {\n    private\n};\n");
		expect(typeAfter(state, "private", ":").doc.toString()).toBe("class W {\nprivate:\n};\n");
	});

	test("a nested class dedents its specifier to the class, not the file", () => {
		const state = stateFor("namespace n {\n    class W {\n        public\n    };\n}\n");
		expect(typeAfter(state, "public", ":").doc.toString()).toBe(
			"namespace n {\n    class W {\n    public:\n    };\n}\n",
		);
	});

	test("closing a class at the end of the document adds the semicolon", () => {
		const state = typeAtEnd(stateFor("class W {\n    int x;\n"), "}");
		expect(state.doc.toString()).toBe("class W {\n    int x;\n};");
		expect(state.selection.main.head).toBe(state.doc.length);
	});

	test("a typed brace is aligned with the line that opened the block", () => {
		const state = typeAtEnd(stateFor("class W {\n    int x;\n    "), "}");
		expect(state.doc.toString()).toBe("class W {\n    int x;\n};");
	});

	test("a typed brace closing a function is aligned but gains no semicolon", () => {
		const state = typeAtEnd(stateFor("void f() {\n    int x = 1;\n    "), "}");
		expect(state.doc.toString()).toBe("void f() {\n    int x = 1;\n}");
	});

	test("a typed brace replaces the one closeBrackets left below it", () => {
		// The shape `class A {` + Enter leaves: the caret on an indented blank line and the auto
		// brace one line below. Typing `}` there used to produce `    };` plus a stray `}`.
		const doc = "class A {\n    void f();\n    \n}\n";
		const caret = doc.indexOf("\n    \n") + 5;
		const typed = type(stateFor(doc), caret, "}");
		expect(typed.doc.toString()).toBe("class A {\n    void f();\n};\n");
		expect(typed.selection.main.head).toBe(typed.doc.toString().indexOf("};") + 2);
	});

	test("the same shape around a function body gains no semicolon", () => {
		const doc = "void f() {\n    int x = 1;\n    \n}\n";
		const caret = doc.indexOf("\n    \n") + 5;
		expect(type(stateFor(doc), caret, "}").doc.toString()).toBe(
			"void f() {\n    int x = 1;\n}\n",
		);
	});

	test("typing over the waiting brace itself still adds the semicolon", () => {
		const state = stateFor("struct P {\n    int v;\n}\n");
		const brace = state.doc.toString().lastIndexOf("}");
		const typed = state.update({
			changes: { from: brace, to: brace + 1, insert: "}" },
			selection: { anchor: brace + 1 },
			userEvent: "input.type",
		}).state;
		expect(typed.doc.toString()).toBe("struct P {\n    int v;\n};\n");
	});

	test("a class closed inline gets its semicolon too", () => {
		const state = typeAtEnd(stateFor("class A {"), "}");
		expect(state.doc.toString()).toBe("class A {};");
		expect(state.selection.main.head).toBe(state.doc.length);
	});

	test("the semicolon arrives with the brace closeBrackets fills in", () => {
		// The shape nobody escapes: `{` is typed once and its `}` is auto-filled, so this is where the
		// semicolon has to appear — the user never types the closing brace.
		const state = stateFor("class A ");
		const typed = state.update({
			changes: { from: 8, insert: "{}" },
			selection: { anchor: 9 },
			userEvent: "input.type",
		}).state;
		expect(typed.doc.toString()).toBe("class A {};");
		expect(typed.selection.main.head).toBe(9);
	});

	test("an auto-closed enum and struct earn the semicolon as well", () => {
		for (const header of ["enum class Mode ", "struct Plain ", "union U "]) {
			const state = stateFor(header);
			const at = header.length;
			const typed = state.update({
				changes: { from: at, insert: "{}" },
				selection: { anchor: at + 1 },
				userEvent: "input.type",
			}).state;
			expect(typed.doc.toString()).toBe(`${header.trimEnd()} {};`);
		}
	});

	test("an auto-closed function and namespace earn nothing", () => {
		for (const header of ["void f() ", "namespace n "]) {
			const state = stateFor(header);
			const at = header.length;
			const typed = state.update({
				changes: { from: at, insert: "{}" },
				selection: { anchor: at + 1 },
				userEvent: "input.type",
			}).state;
			expect(typed.doc.toString()).toBe(`${header.trimEnd()} {}`);
		}
	});

	test("stepping over the auto-filled brace on the same line adds the semicolon", () => {
		const doc = "class A {}";
		const brace = doc.indexOf("}");
		const typed = stateFor(doc).update({
			changes: { from: brace, to: brace + 1, insert: "}" },
			selection: { anchor: brace + 1 },
			userEvent: "input.type",
		}).state;
		expect(typed.doc.toString()).toBe("class A {};");
	});

	test("a brace in the middle of a line is left alone", () => {
		const doc = "struct X {} x;\n";
		expect(type(stateFor(doc), doc.length, "").doc.toString()).toBe(doc);
	});

	test("a function brace is not mistaken for a class", () => {
		const state = stateFor("void f() {\n    int x = 1;\n}\n");
		expect(closesScopeAt(state, state.doc.toString().lastIndexOf("}") + 1)).toBe(false);
	});

	test("typing anywhere in a class body leaves the caret inside the document", () => {
		// The property the whole filter rests on: one keystroke, one change, a plan measured on the text
		// it lands in — every position, and the rules' own triggers.
		const doc = "namespace n {\n    class B {\n        int y;\n    \n    }\n};\n";
		for (let at = 0; at <= doc.length; at += 1) {
			for (const text of ["}", "{", "{}", ":", ";"]) {
				const typed = type(stateFor(doc), at, text);
				expect(typed.selection.main.head).toBeLessThanOrEqual(typed.doc.length);
			}
		}
	});

	test("a guard: a plan can never hand CodeMirror a caret outside its document", () => {
		// Not a user path: with no `allowMultipleSelections` typing is one change per transaction. This
		// is the shape such an extension would make reachable, and it must not take the window down.
		const doc = "class A {\n    int x;\n    \n}\n";
		const typed = stateFor(doc).update({
			changes: [
				{ from: 21, insert: "}" },
				{ from: 26, insert: "}" },
			],
			selection: { anchor: 27 },
			userEvent: "input.type",
		}).state;
		expect(typed.doc.toString()).toBe("class A {\n    int x;\n};}\n");
		expect(typed.selection.main.head).toBeLessThanOrEqual(typed.doc.length);
	});

	test("a guard: an edit past the end is dropped and a caret past it is clamped", () => {
		const edits = [
			{ from: 0, to: 2, insert: "" },
			{ from: 14, insert: ";" },
		];
		const plan = { edits, selection: 16 };
		// A heuristic position it cannot place disappears rather than being dispatched.
		expect(boundedPlan(plan, 10)).toEqual({ edits: [edits[0]], selection: 8 });
		const late = { edits: [{ from: 4, insert: ";" }], selection: 40 };
		expect(boundedPlan(late, 10).selection).toBe(11);
	});
});
