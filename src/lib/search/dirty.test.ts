import { describe, expect, test } from "bun:test";
import type { FileBuffer } from "@/lib/project/buffer";
import { dirtyReplaceMessage, dirtyReplaceTargets } from "@/lib/search/dirty";

const ROOT = "/project";

function buffer(path: string, text: string, loaded: string): FileBuffer {
	return { path: `${ROOT}/${path}`, name: path.slice(path.lastIndexOf("/") + 1), text, loaded };
}

describe("dirtyReplaceTargets", () => {
	// The bug this pins: the backend reads and rewrites files from disk, so a replace-all silently
	// threw away edits that were still only in a tab.
	test("a dirty buffer blocks the replace and is named", () => {
		const dirty = buffer("src/main.rs", "typed, not saved", "saved");
		const clean = buffer("src/lib.rs", "same", "same");

		const blocked = dirtyReplaceTargets([dirty, clean], [dirty.path, clean.path]);

		expect(blocked).toEqual([dirty.path]);
		expect(dirtyReplaceMessage(blocked)).toContain(dirty.path);
	});

	test("a dirty buffer outside the matched files does not block", () => {
		const dirty = buffer("src/other.rs", "typed", "saved");
		const target = `${ROOT}/src/main.rs`;

		expect(dirtyReplaceTargets([dirty], [target])).toEqual([]);
	});

	test("every blocked file is named, sorted", () => {
		const first = buffer("src/b.rs", "typed", "saved");
		const second = buffer("src/a.rs", "typed", "saved");

		const blocked = dirtyReplaceTargets([first, second], [first.path, second.path]);

		expect(blocked).toEqual([second.path, first.path]);
		expect(dirtyReplaceMessage(blocked)).toContain(first.path);
		expect(dirtyReplaceMessage(blocked)).toContain(second.path);
	});
});
