import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@/test/render";
import type { DockTab } from "@/ui/tests/parts";
import { DockOverflowMenu } from "@/ui/tests/DockOverflowMenu";

const counts = {
	testsCount: 12,
	failed: 2,
	problemsErrors: 3,
	todoCount: 4,
	bookmarksCount: 5,
	debugStatus: "idle" as const,
	runStatus: null,
};

function open(onSelectTab: (tab: DockTab) => void = () => {}) {
	return render(
		<DockOverflowMenu hidden={["console", "memory"]} onSelectTab={onSelectTab} {...counts} />,
	);
}

describe("the dock's overflow menu", () => {
	afterEach(cleanup);

	test("the button advertises a menu and opens it with focus inside", () => {
		const view = open();
		const trigger = view.getByRole("button", { name: "More dock tabs" });
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		const menu = view.getByRole("menu", { name: "More dock tabs" });
		expect(menu.contains(document.activeElement)).toBe(true);
	});

	test("lists exactly the hidden tabs", () => {
		const view = open();
		fireEvent.click(view.getByRole("button", { name: "More dock tabs" }));
		const items = view.getAllByRole("menuitem").map((item) => item.textContent);
		expect(items).toEqual(["Console", "Memory"]);
	});

	test("selecting a tab reports it and closes the menu", () => {
		const selected: string[] = [];
		const view = open((tab) => selected.push(tab));
		fireEvent.click(view.getByRole("button", { name: "More dock tabs" }));
		fireEvent.click(view.getByRole("menuitem", { name: /Memory/ }));
		expect(selected).toEqual(["memory"]);
		expect(view.queryByRole("menu")).toBeNull();
	});

	test("Escape closes it and returns focus to the button", () => {
		const view = open();
		const trigger = view.getByRole("button", { name: "More dock tabs" });
		fireEvent.click(trigger);
		const menu = view.getByRole("menu", { name: "More dock tabs" });
		fireEvent.keyDown(menu, { key: "Escape" });
		expect(view.queryByRole("menu")).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});
});
