import { describe, expect, test } from "bun:test";
import { changesByPath } from "@/lib/git/changes";
import type { GitStatus } from "@/lib/project/api";

const status = (entries: GitStatus["entries"]): GitStatus => ({
	branch: "main",
	entries,
	ahead: 0,
	behind: 0,
});

describe("changesByPath", () => {
	test("maps each path to its status", () => {
		expect(
			changesByPath(
				status([
					{ path: "a.ts", status: "modified", staged: false },
					{ path: "b.ts", status: "untracked", staged: false },
				]),
			),
		).toEqual({ "a.ts": "modified", "b.ts": "untracked" });
	});

	test("no status read is an empty map", () => {
		expect(changesByPath(null)).toEqual({});
	});

	test("a later entry for one path wins, as Object.fromEntries did", () => {
		expect(
			changesByPath(
				status([
					{ path: "a.ts", status: "modified", staged: false },
					{ path: "a.ts", status: "added", staged: true },
				]),
			),
		).toEqual({ "a.ts": "added" });
	});
});
