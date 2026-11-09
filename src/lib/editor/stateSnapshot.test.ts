import { describe, expect, test } from "bun:test";
import { history, undo } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { snapshotState, stateFromSnapshot } from "@/lib/editor/stateSnapshot";

/** A state with one committed edit and a caret away from the start. */
function edited(extensions: Extension = [history()]): EditorState {
	const start = EditorState.create({ doc: "one\ntwo", extensions });
	return start.update({
		changes: { from: 0, insert: "zero\n" },
		selection: { anchor: 9 },
	}).state;
}

/** The state after undoing once, or the same state when there is nothing to undo. */
function undoTo(state: EditorState): EditorState {
	const box = { state };
	undo({
		state,
		dispatch: (transaction) => {
			box.state = transaction.state;
		},
	});
	return box.state;
}

describe("snapshotState", () => {
	test("keeps the text and the selection", () => {
		const snapshot = snapshotState(edited());
		expect(snapshot.doc).toBe("zero\none\ntwo");
		expect(snapshot.selection).toEqual({
			ranges: [{ anchor: 9, head: 9 }],
			main: 0,
		});
	});
});

describe("stateFromSnapshot", () => {
	test("restores the text, the caret and the undo history", () => {
		const restored = stateFromSnapshot(snapshotState(edited()), [history()]);
		expect(restored).not.toBeNull();
		if (restored === null) return;
		expect(restored.doc.toString()).toBe("zero\none\ntwo");
		expect(restored.selection.main.anchor).toBe(9);
		expect(undoTo(restored).doc.toString()).toBe("one\ntwo");
	});

	test("a snapshot without the history field still mounts, just without undo steps", () => {
		const state = EditorState.create({ doc: "one", extensions: [history()] });
		const restored = stateFromSnapshot(state.toJSON(), [history()]);
		expect(restored?.doc.toString()).toBe("one");
		expect(undoTo(restored ?? state).doc.toString()).toBe("one");
	});

	test("the mount's extensions win over the ones the snapshot was taken with", () => {
		const snapshot = snapshotState(edited([history(), EditorState.tabSize.of(2)]));
		const restored = stateFromSnapshot(snapshot, [history(), EditorState.tabSize.of(8)]);
		expect(restored?.tabSize).toBe(8);
	});

	test("a snapshot that cannot be read is a miss instead of a crash", () => {
		expect(stateFromSnapshot({}, [history()])).toBeNull();
		expect(stateFromSnapshot(null, [history()])).toBeNull();
		expect(stateFromSnapshot({ doc: "ok", selection: null }, [history()])).toBeNull();
	});
});
