import { describe, expect, test } from "bun:test";
import { planToggle } from "@/lib/tree/toggle";

describe("planToggle", () => {
	test("opening a closed folder reads its listing again", () => {
		const plan = planToggle(new Set(), "/p/src");
		expect(plan.open).toBe(true);
		expect(plan.relist).toBe(true);
		expect([...plan.expanded]).toEqual(["/p/src"]);
	});

	test("closing an open folder reads nothing", () => {
		const plan = planToggle(new Set(["/p/src"]), "/p/src");
		expect(plan.open).toBe(false);
		expect(plan.relist).toBe(false);
		expect(plan.expanded.size).toBe(0);
	});

	test("reopening after a collapse asks for a fresh listing despite the settled entry", () => {
		const collapsed = planToggle(new Set(["/p/src"]), "/p/src");
		const reopened = planToggle(collapsed.expanded, "/p/src");
		expect(reopened.open).toBe(true);
		expect(reopened.relist).toBe(true);
	});

	test("leaves another folder's expansion alone", () => {
		const plan = planToggle(new Set(["/p/lib"]), "/p/src");
		expect([...plan.expanded].sort()).toEqual(["/p/lib", "/p/src"]);
	});
});
