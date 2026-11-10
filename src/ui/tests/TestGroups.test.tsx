import { afterEach, describe, expect, mock, test } from "bun:test";
import type { TestItem, TestReport } from "@/lib/project/api";
import { cleanup, fireEvent, render } from "@/test/render";
import { TestGroups } from "@/ui/tests/TestGroups";

const TESTS: TestItem[] = [
	{ name: "tests::adds", binary: "src/lib.rs", suite: "cargo" },
	{ name: "tests::inner::nested", binary: "src/lib.rs", suite: "cargo" },
];

function panel(onRunGroup: (names: string[]) => void, collapsed: boolean) {
	return render(
		<TestGroups
			groups={[{ binary: "src/lib.rs", suite: "cargo", tests: TESTS }]}
			results={new Map<string, TestReport>()}
			running={new Set<string>()}
			collapsedGroups={new Set(collapsed ? ["src/lib.rs"] : [])}
			onToggleGroup={() => {}}
			highlighted={-1}
			onRun={() => {}}
			onRunGroup={onRunGroup}
			emptyMessage="no tests"
		/>,
	);
}

afterEach(cleanup);

describe("the tests dock's group header", () => {
	test("runs every test of the group from its own button, in list order", () => {
		const runs = mock((_names: string[]) => {});
		const view = panel(runs, false);

		fireEvent.click(view.getByTitle("run 2 tests in src/lib.rs"));

		expect(runs).toHaveBeenCalledWith(["tests::adds", "tests::inner::nested"]);
	});

	test("keeps the button on a collapsed group, where no row is drawn", () => {
		const runs = mock((_names: string[]) => {});
		const view = panel(runs, true);

		expect(view.queryByText("tests::adds")).toBeNull();
		fireEvent.click(view.getByTitle("run 2 tests in src/lib.rs"));

		expect(runs).toHaveBeenCalledWith(["tests::adds", "tests::inner::nested"]);
	});
});
