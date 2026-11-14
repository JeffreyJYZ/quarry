import { describe, expect, test } from "bun:test";
import type { FileEdit } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { applyEdits, applyFileEdits } from "@/lib/refactor/apply";

/**
 * A `WorkspaceEdit` names ranges in the document its server last saw.
 *
 * These are the stale cases: the response arrives after the buffer changed. A `changes`-shaped
 * rename carries no version at all (`src-tauri/src/lsp/lsp_rename.rs:92`), so
 * `src/lib/refactor/apply.ts:93` has nothing to compare and the edit is merged into text it was
 * never computed against — silently wrong, because `toOffset` clamps instead of throwing.
 *
 * The tests below assert the safe outcome, so each one fails until the fix lands.
 */

const PATH = "/p/w.cpp";
/** The document the server saw when it computed the rename. */
const DOC_A = "class Widget {\n    int count;\n};\n";
/** The same file after a header line was saved: clean, one line longer. */
const DOC_B = `// header\n${DOC_A}`;

/** `count` on line 1 of DOC_A becomes `total`, as clangd returns it in `changes`. */
const renameEdits: FileEdit["edits"] = [
	{
		range: { start: { line: 1, character: 8 }, end: { line: 1, character: 13 } },
		newText: "total",
	},
];

function buffer(text: string): FileBuffer {
	return { path: PATH, name: "w.cpp", text, loaded: text };
}

function harness(initial: FileBuffer[]) {
	let state = initial;
	const setBuffers = (updater: (current: FileBuffer[]) => FileBuffer[]) => {
		state = updater(state);
	};
	return { setBuffers, text: () => state[0]?.text };
}

describe("a rename computed against an older document", () => {
	test("is refused, not merged into the text that replaced it", async () => {
		const live = buffer(DOC_B);
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: PATH, version: null, edits: renameEdits }];

		await applyFileEdits(edits, [live], tree.setBuffers, () => null);

		// Today: line 1 is `class Widget {`, so the ranges rewrite it as `class Witotal{` and the
		// `count` they were meant for is still there. No throw, because applyEdits clamps offsets.
		const broken = applyEdits(DOC_B, renameEdits);
		expect(broken).not.toBe(DOC_B);
		expect(tree.text()).toBe(DOC_B);
	});

	test("a stale snapshot never overwrites text typed after it was taken", async () => {
		// `src/ui/problems/useProblemActions.ts:147` hands the buffer list from its render, and
		// `applyFileEdits` derives the new text from that copy before writing the live array.
		const snapshot = [buffer(DOC_A)];
		const tree = harness([buffer(DOC_B)]);

		await applyFileEdits(
			[{ path: PATH, edits: renameEdits }],
			snapshot,
			tree.setBuffers,
			() => null,
		);

		expect(tree.text()).toBe(DOC_B);
	});
});

describe("the guards that do hold", () => {
	test("an unsaved buffer is refused", async () => {
		const dirty = { ...buffer(DOC_B), loaded: DOC_A };
		const tree = harness([dirty]);
		const edits: FileEdit[] = [{ path: PATH, edits: renameEdits }];

		const result = await applyFileEdits(edits, [dirty], tree.setBuffers, () => null);

		expect(result.refused).toHaveLength(1);
		expect(tree.text()).toBe(DOC_B);
	});

	test("a declared version that disagrees with the editor is refused", async () => {
		const live = buffer(DOC_B);
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: PATH, version: 4, edits: renameEdits }];

		const result = await applyFileEdits(edits, [live], tree.setBuffers, () => 9);

		expect(result.refused).toHaveLength(1);
		expect(tree.text()).toBe(DOC_B);
	});
});
