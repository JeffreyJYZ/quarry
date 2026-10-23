import { describe, expect, test } from "bun:test";
import { splitHunks } from "./hunks";

describe("splitHunks", () => {
	test("splits and ids stable", () => {
		const diff =
			"diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n-old\n+new\n@@ -5,1 +5,2 @@\n ctx\n+added\n";
		const first = splitHunks(diff);
		const second = splitHunks(diff);
		expect(first.length).toBe(2);
		expect(first[0].id).toBe(second[0].id);
		expect(first[1].id).toBe(second[1].id);
	});
});
