import "@/test/render";
import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { renderHook } from "@testing-library/react";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";
import { useEditorEffects } from "@/ui/editor/useEditorEffects";

/**
 * A go-to-definition answer is a line and character in the document the server saw, and it is
 * applied after the round trip (`src/ui/editor/keymapLsp.ts:58`, `src/ui/app/lspCommandHandlers.ts:47`).
 *
 * `src/ui/editor/useEditorEffects.ts:86-93` measures the target against `view.state.doc` when it
 * lands and clamps both line and character, so a location past the end of the live document moves
 * the caret to the end instead of building a range outside it.
 */

type Reveal = { line: number; character: number; token: number };

function mountEffects(doc: string, reveal: Reveal) {
	const view = new EditorView({
		state: EditorState.create({ doc }),
		parent: document.createElement("div") as unknown as HTMLElement,
	});
	const viewRef = { current: view as EditorView | null };
	const refs = {
		viewRef,
		languageRef: { current: null },
		indentRef: { current: null },
		hostRef: { current: null },
		revealTokenRef: { current: null as number | null },
	} as unknown as EditorRefs;

	const hook = renderHook(() =>
		useEditorEffects({
			refs,
			path: "/p/a.cpp",
			tabSize: 4,
			fontSize: 13,
			fontFamily: "",
			blame: null,
			reveal,
			applyInlay: () => undefined,
			runInlay: async () => undefined,
			inlayTimerRef: { current: null },
			inlaySeqRef: { current: 0 },
			inlayHintsRef: { current: [] },
		}),
	);
	return { view, hook };
}

describe("a navigation target past the end of the live document", () => {
	test("the caret lands inside the document and nothing throws", () => {
		const { view } = mountEffects("one\ntwo\n", { line: 99, character: 99, token: 1 });

		const head = view.state.selection.main.head;
		expect(head).toBeLessThanOrEqual(view.state.doc.length);
		expect(head).toBeGreaterThanOrEqual(0);
		// The last line is the closest real line to the stale one.
		expect(view.state.doc.lineAt(head).number).toBe(view.state.doc.lines);
	});
});
