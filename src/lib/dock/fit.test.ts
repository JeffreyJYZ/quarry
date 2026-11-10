import { describe, expect, test } from "bun:test";
import { fitDockTabs } from "@/lib/dock/fit";

const TABS = ["problems", "bookmarks", "tests", "run", "debugger", "console", "memory", "todo"];

function widths(value: number): Map<string, number> {
	return new Map(TABS.map((tab) => [tab, value]));
}

describe("fitting the dock's tabs into its row", () => {
	test("everything fits, so no tab is hidden and there is no overflow button", () => {
		const fit = fitDockTabs({
			tabs: TABS,
			widths: widths(50),
			active: "problems",
			available: 500,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toEqual(TABS);
		expect(fit.hidden).toEqual([]);
		expect(fit.overflow).toBe(false);
	});

	test("a few tabs are hidden, and order is kept on both sides", () => {
		const fit = fitDockTabs({
			tabs: TABS,
			widths: widths(50),
			active: "problems",
			available: 200,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toEqual(["problems", "bookmarks", "tests"]);
		expect(fit.hidden).toEqual(["run", "debugger", "console", "memory", "todo"]);
		expect(fit.overflow).toBe(true);
	});

	test("the active tab is shown even when the row has no space left for it", () => {
		const fit = fitDockTabs({
			tabs: TABS,
			widths: widths(50),
			active: "memory",
			available: 200,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toContain("memory");
		expect(fit.hidden).not.toContain("memory");
		expect(fit.overflow).toBe(true);
	});

	test("never names a tab in both lists", () => {
		const fit = fitDockTabs({
			tabs: TABS,
			widths: widths(50),
			active: "debugger",
			available: 260,
			overflowWidth: 26,
			gap: 2,
		});
		for (const tab of fit.visible) expect(fit.hidden).not.toContain(tab);
		expect([...fit.visible, ...fit.hidden].sort()).toEqual([...TABS].sort());
	});

	test("a tab wider than the whole row still shows when it is active", () => {
		const wide = new Map(TABS.map((tab) => [tab, 50]));
		wide.set("tests", 400);
		const fit = fitDockTabs({
			tabs: ["problems", "tests"],
			widths: wide,
			active: "tests",
			available: 200,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toEqual(["tests"]);
		expect(fit.hidden).toEqual(["problems"]);
		expect(fit.overflow).toBe(true);
	});

	test("a single tab wider than the row is still the one shown", () => {
		const fit = fitDockTabs({
			tabs: ["tests"],
			widths: new Map([["tests", 400]]),
			active: "tests",
			available: 200,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toEqual(["tests"]);
		expect(fit.hidden).toEqual([]);
		expect(fit.overflow).toBe(false);
	});

	test("no tabs means no row and no menu", () => {
		const fit = fitDockTabs({
			tabs: [],
			widths: new Map(),
			active: "problems",
			available: 200,
			overflowWidth: 26,
			gap: 2,
		});
		expect(fit.visible).toEqual([]);
		expect(fit.hidden).toEqual([]);
		expect(fit.overflow).toBe(false);
	});
});
