import { describe, expect, test } from "bun:test";
import type { FileEdit } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { applyEdits, applyFileEdits, refusalNotice } from "@/lib/refactor/apply";

function buffer(overrides: Partial<FileBuffer> = {}): FileBuffer {
	return { path: "/p/a.rs", name: "a.rs", text: "", loaded: "", ...overrides };
}

/** A `setBuffers` that mutates a local list, so a test can read the text that was written. */
function harness(buffers: FileBuffer[]) {
	let state = buffers;
	let writes = 0;
	const setBuffers = (updater: (current: FileBuffer[]) => FileBuffer[]) => {
		state = updater(state);
		writes += 1;
	};
	return { setBuffers, get: () => state, writes: () => writes };
}

function wholeLine(newText: string): FileEdit["edits"] {
	return [
		{
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
			newText,
		},
	];
}

describe("applyFileEdits version guard", () => {
	test("a stale version refuses the file and leaves its text untouched", async () => {
		const live = buffer({ text: "old", loaded: "old" });
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: live.path, version: 8, edits: wholeLine("new") }];

		const result = await applyFileEdits(edits, [live], tree.setBuffers, () => 7);

		expect(result.files).toBe(0);
		expect(result.refused).toHaveLength(1);
		expect(result.refused[0].path).toBe("/p/a.rs");
		expect(tree.get()[0].text).toBe("old");
		expect(tree.writes()).toBe(0);
	});

	test("a matching version applies", async () => {
		const live = buffer({ text: "old", loaded: "old" });
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: live.path, version: 7, edits: wholeLine("new") }];

		const result = await applyFileEdits(edits, [live], tree.setBuffers, () => 7);

		expect(result.files).toBe(1);
		expect(result.refused).toEqual([]);
		expect(tree.get()[0].text).toBe("new");
	});

	test("a versionless edit still applies to an unmodified buffer", async () => {
		const live = buffer({ text: "old", loaded: "old" });
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: live.path, edits: wholeLine("new") }];

		const result = await applyFileEdits(edits, [live], tree.setBuffers, () => null);

		expect(result.files).toBe(1);
		expect(tree.get()[0].text).toBe("new");
	});

	test("an unsaved buffer is refused and the notice names the file", async () => {
		const live = buffer({ text: "typed", loaded: "old" });
		const tree = harness([live]);
		const edits: FileEdit[] = [{ path: live.path, edits: wholeLine("new") }];

		const result = await applyFileEdits(edits, [live], tree.setBuffers, () => null);

		expect(result.files).toBe(0);
		expect(result.refused).toHaveLength(1);
		const notice = refusalNotice(result.refused[0]);
		expect(notice).toContain("a.rs");
		expect(notice).toContain("unsaved changes");
		expect(tree.get()[0].text).toBe("typed");
	});
});

describe("applyEdits line endings", () => {
	test("a CRLF file takes a multi-line edit and keeps its endings", () => {
		const text = "one\r\ntwo\r\nthree\r\n";
		const edits: FileEdit["edits"] = [
			{
				range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } },
				newText: "!",
			},
			{
				range: { start: { line: 2, character: 5 }, end: { line: 2, character: 5 } },
				newText: "?",
			},
		];

		expect(applyEdits(text, edits)).toBe("o!ne\r\ntwo\r\nthree?\r\n");
	});

	test("a position past a CRLF line's text does not split the terminator", () => {
		const edits: FileEdit["edits"] = [
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 99 } },
				newText: "x",
			},
		];

		expect(applyEdits("one\r\ntwo", edits)).toBe("x\r\ntwo");
	});

	test("a lone carriage return still opens a line", () => {
		const edits: FileEdit["edits"] = [
			{
				range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
				newText: "x",
			},
		];

		expect(applyEdits("a\rb", edits)).toBe("a\rxb");
	});

	test("edits arrive in descending order, so earlier offsets stay valid", () => {
		const edits: FileEdit["edits"] = [
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: "[",
			},
			{
				range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } },
				newText: "]",
			},
		];

		expect(applyEdits("one", edits)).toBe("[one]");
	});
});
