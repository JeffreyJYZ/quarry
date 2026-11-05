import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { completionStatus } from "@codemirror/autocomplete";
import { completionBindings } from "@/ui/editor/keymapCompletion";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/**
 * A view-shaped stub: the bindings only read `state` and dispatch transactions.
 *
 * The completion-accept path needs a real `EditorView` (auto-completion moves from `pending` to
 * `active` through the view's measure loop), so what is asserted here is the other half: with nothing
 * open, Enter still breaks the line at the language's indent instead of being swallowed.
 */
function stubView(doc: string, caret: number) {
	let state = EditorState.create({ doc, selection: { anchor: caret } });
	const view = {
		get state() {
			return state;
		},
		dispatch: (transaction: unknown) => {
			state = state.update(transaction as never).state;
		},
		focus: () => {},
	};
	return { view: view as never, state: () => state };
}

const deps = {} as KeymapDeps;
const enter = completionBindings(deps).find((binding) => binding.key === "Enter");

describe("Enter", () => {
	test("is bound", () => {
		expect(enter).toBeDefined();
	});

	test("breaks the line when no completion is open", () => {
		const harness = stubView("int main() {\n    int x = 0;\n}", 27);
		expect(completionStatus(harness.state())).not.toBe("active");
		expect(enter?.run?.(harness.view)).toBe(true);
		expect(harness.state().doc.lines).toBe(4);
		expect(harness.state().doc.line(3).text.startsWith("    ")).toBe(true);
	});
});
