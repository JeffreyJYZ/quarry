import { describe, expect, test } from "bun:test";
import { groupBlame } from "@/git/blame";
import type { BlameLine } from "@/project/api";

function line(n: number, hash: string): BlameLine {
	return { line: n, hash, author: "a", subject: "s" };
}

describe("groupBlame", () => {
	test("groups consecutive same-hash lines", () => {
		const lines = [
			line(1, "aaa"),
			line(2, "aaa"),
			line(3, "bbb"),
			line(4, "bbb"),
			line(5, "bbb"),
		];
		const groups = groupBlame(lines);
		expect(groups.length).toBe(2);
		expect(groups[0]?.startLine).toBe(1);
		expect(groups[0]?.endLine).toBe(2);
		expect(groups[1]?.startLine).toBe(3);
		expect(groups[1]?.endLine).toBe(5);
	});

	test("reappearing commit starts a new group", () => {
		const lines = [line(1, "aaa"), line(2, "bbb"), line(3, "aaa")];
		const groups = groupBlame(lines);
		expect(groups.length).toBe(3);
		expect(groups[0]?.hash).toBe("aaa");
		expect(groups[2]?.hash).toBe("aaa");
		expect(groups[0]).not.toBe(groups[2]);
	});
});
