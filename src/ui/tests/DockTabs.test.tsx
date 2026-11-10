import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@/test/render";
import { DockTabs } from "@/ui/tests/DockTabs";

const restore: (() => void)[] = [];

/** Layout in a test DOM is zero, so a test that needs a width says so here. */
function stubWidths(tabWidth: number, rowWidth: number) {
	const proto = HTMLElement.prototype;
	const offset = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
	const client = Object.getOwnPropertyDescriptor(proto, "clientWidth");
	Object.defineProperty(proto, "offsetWidth", {
		configurable: true,
		get(this: HTMLElement) {
			return this.classList.contains("dock-tab-more") ? 26 : tabWidth;
		},
	});
	Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => rowWidth });
	restore.push(() => {
		if (offset === undefined) Reflect.deleteProperty(proto, "offsetWidth");
		else Object.defineProperty(proto, "offsetWidth", offset);
		if (client === undefined) Reflect.deleteProperty(proto, "clientWidth");
		else Object.defineProperty(proto, "clientWidth", client);
	});
}

function dock(onSelectTab: (tab: string) => void = () => {}) {
	return render(
		<DockTabs
			expanded
			onToggleExpanded={() => {}}
			tab="problems"
			onSelectTab={onSelectTab}
			testsCount={0}
			failed={0}
			problemsErrors={0}
			todoCount={0}
			bookmarksCount={0}
			debugStatus="idle"
			runStatus={null}
		/>,
	);
}

describe("the dock's tab strip", () => {
	afterEach(() => {
		cleanup();
		for (const undo of restore.splice(0)) undo();
	});

	test("parks the tabs that do not fit and lists them behind the button", () => {
		stubWidths(50, 200);
		const view = dock();
		expect(view.container.querySelectorAll(".dock-tab:not(.parked)").length).toBe(3);
		expect(view.container.querySelectorAll(".dock-tab.parked").length).toBe(5);

		fireEvent.click(view.getByRole("button", { name: "More dock tabs" }));
		expect(view.getAllByRole("menuitem").length).toBe(5);
		for (const label of ["Run", "Debugger", "Console", "Memory", "TODO"]) {
			expect(view.queryByRole("menuitem", { name: new RegExp(`^${label}`) })).not.toBeNull();
		}
	});

	test("selecting a parked tab reports it", () => {
		const seen: string[] = [];
		stubWidths(50, 200);
		const view = dock((tab) => seen.push(tab));
		fireEvent.click(view.getByRole("button", { name: "More dock tabs" }));
		fireEvent.click(view.getByRole("menuitem", { name: /Console/ }));
		expect(seen).toEqual(["console"]);
	});

	test("a row wide enough shows every tab and no button", () => {
		stubWidths(50, 2000);
		const view = dock();
		expect(view.container.querySelectorAll(".dock-tab").length).toBe(8);
		expect(view.container.querySelectorAll(".dock-tab.parked").length).toBe(0);
		expect(view.queryByRole("button", { name: "More dock tabs" })).toBeNull();
	});

	test("with nothing measurable every tab stays visible", () => {
		const view = dock();
		expect(view.container.querySelectorAll(".dock-tab").length).toBe(8);
		expect(view.queryByRole("button", { name: "More dock tabs" })).toBeNull();
	});
});
