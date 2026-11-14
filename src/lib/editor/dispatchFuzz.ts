/**
 * A deterministic fuzz harness for the editor's own dispatch path.
 *
 * A typed character goes through the `EditorView.inputHandler` facet first (where `closeBrackets`
 * lives) and only falls back to a plain `input.type` dispatch; newline runs the app's Enter command,
 * and paste, delete, undo and redo are driven the same way. Every step reads `view.state`, because
 * `state.update` is lazy; undo then redo brackets each step, so a corrupt history also fails.
 */
import { closeBrackets } from "@codemirror/autocomplete";
import { history, insertNewlineAndIndent, isolateHistory, redo, undo } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { indentOnInput, indentUnit } from "@codemirror/language";
import { EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expandBracketPair } from "@/lib/editor/commands";
import { cppEditing } from "@/lib/editor/cppEditing";
import { searchDecorations, searchField } from "@/lib/editor/search";

/** Documents the arithmetic is most likely to trip over. EditorState normalises line breaks. */
export const DOCS = [
	"",
	"class A {\n    int x;\n",
	"class A {",
	"struct P {\n    int v;\n}\n",
	"class Widget {\n    int width;\n    int height;\n    void draw();\n};",
	"class A {\n    int x;",
	"class A {\r\n    int x;\r\n    int y;\r\n};",
	"namespace n {\n    class C {\n        public:\n    };\n}\n",
	"class Q { int a; int b; int c; int d; int e; int f; int g; int h; };",
];

const TYPED = ["{", "}", ";", ":", "\n", "x", "{}", "}}", "class B ", "int y;", "public"];
const PASTED = ["int z = 2;", "struct S {\n    int a;\n};\n", "}", "void draw();\n", "private:"];

export type Step =
	| { kind: "type"; from: number; to: number; text: string }
	| { kind: "paste"; from: number; to: number; text: string }
	| { kind: "delete"; from: number; to: number }
	| { kind: "undo" }
	| { kind: "redo" };

export type Violation = {
	seed: number;
	doc: string;
	step: Step;
	error: string;
};

/** mulberry32: small, fast and identical on every machine. */
export function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function extensions(sink: unknown[]): Extension[] {
	return [
		cpp(),
		closeBrackets(),
		history(),
		indentOnInput(),
		indentUnit.of("    "),
		EditorState.tabSize.of(4),
		cppEditing(),
		searchField,
		searchDecorations,
		EditorView.exceptionSink.of((exception) => sink.push(exception)),
	];
}

export function createView(host: HTMLElement, doc: string, sink: unknown[]): EditorView {
	const state = EditorState.create({ doc, extensions: extensions(sink) });
	return new EditorView({ parent: host, state });
}

/** Deliver typed text the way the DOM does: the input handlers first, then the default dispatch. */
function type(view: EditorView, text: string): void {
	const { from, to } = view.state.selection.main;
	const insert = (): Transaction =>
		view.state.update({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
			userEvent: "input.type",
			scrollIntoView: true,
		});
	for (const handler of view.state.facet(EditorView.inputHandler)) {
		if (handler(view, from, to, text, insert)) return;
	}
	view.dispatch(insert());
}

/** One step from the selection it starts at; the selection is applied first, as a click would be. */
export function applyStep(view: EditorView, step: Step): void {
	if (step.kind === "undo") return void undo(view);
	if (step.kind === "redo") return void redo(view);
	view.dispatch({
		selection: { anchor: step.from, head: step.to },
		annotations: isolateHistory.of("full"),
	});
	if (step.kind === "type") {
		if (step.text !== "\n") type(view, step.text);
		else if (!expandBracketPair(view)) insertNewlineAndIndent(view);
		return;
	}
	if (step.kind === "paste") {
		view.dispatch({
			changes: { from: step.from, to: step.to, insert: step.text },
			selection: { anchor: step.from + step.text.length },
			userEvent: "input.paste",
		});
		return;
	}
	view.dispatch({
		changes: { from: step.from, to: step.to },
		userEvent: "delete.backward",
	});
}

/** A step drawn against the document it will run on, so its positions always exist. */
export function generateStep(rng: () => number, doc: string): Step {
	const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)];
	const roll = rng();
	const length = doc.length;
	const from = Math.floor(rng() * (length + 1));
	const span = roll < 0.55 ? Math.min(length - from, Math.floor(rng() * 13)) : 0;
	const to = Math.min(length, from + span);
	if (roll < 0.08) return { kind: "undo" };
	if (roll < 0.11) return { kind: "redo" };
	if (roll < 0.2) return { kind: "delete", from, to };
	if (roll < 0.34) return { kind: "paste", from, to, text: pick(PASTED) };
	return { kind: "type", from, to, text: pick(TYPED) };
}

/** Reads every lazy field and checks the invariants a dispatch must keep. Throws on the first break. */
export function check(view: EditorView, step: Step, seen: Set<string>, sink: unknown[]): string {
	const state = view.state;
	const doc = state.doc.toString();
	if (sink.length > 0) throw new Error(`exception sink: ${String(sink[0])}`);
	for (const range of state.selection.ranges) {
		if (range.from < 0 || range.to > state.doc.length) throw new Error("selection outside doc");
	}
	if (doc.includes("\u0000")) throw new Error("document contains a NUL");
	if (step.kind === "undo" || step.kind === "redo") {
		if (seen.has(doc)) return doc;
		throw new Error(`${step.kind} landed on a document the sequence never produced`);
	}
	return doc;
}

export type Run = { seed: number; doc: string; steps: Step[]; violation: Violation | null };

/** Runs one seed and returns the sequence it generated plus the first violation, if any. */
export function runSeed(seed: number, host: HTMLElement, length = 14): Run {
	const rng = prng(seed);
	const sink: unknown[] = [];
	const view = createView(host, DOCS[seed % DOCS.length], sink);
	// The state normalises CRLF, so every position and comparison is against its own text.
	const doc = view.state.doc.toString();
	const steps: Step[] = [];
	const seen = new Set([doc]);
	let current = doc;
	let violation: Violation | null = null;
	try {
		for (let index = 0; index < length; index += 1) {
			const step = generateStep(rng, current);
			steps.push(step);
			try {
				applyStep(view, step);
				const after = check(view, step, seen, sink);
				if (after !== current && step.kind !== "undo" && step.kind !== "redo") {
					undo(view);
					if (view.state.doc.toString() !== current)
						throw new Error("undo lost the document");
					redo(view);
					if (view.state.doc.toString() !== after)
						throw new Error("redo lost the document");
				}
				seen.add(after);
				current = after;
			} catch (error) {
				violation = {
					seed,
					doc: current,
					step,
					error: error instanceof Error ? error.message : String(error),
				};
				break;
			}
		}
	} finally {
		view.destroy();
	}
	return { seed, doc, steps, violation };
}
