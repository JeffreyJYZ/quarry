import { afterEach, describe, expect, test } from "bun:test";
import type { BookmarkGroup } from "@/lib/bookmarks/model";
import { cleanup, fireEvent, render } from "@/test/render";
import BookmarksPanel from "@/ui/bookmarks/BookmarksPanel";

const groups: BookmarkGroup[] = [
	{
		path: "/p/src/a.rs",
		label: "src/a.rs",
		rows: [
			{ path: "/p/src/a.rs", line: 3, text: "fn main() {" },
			{ path: "/p/src/a.rs", line: 9, text: "    let x = 1;" },
		],
	},
	{
		path: "/p/src/b.rs",
		label: "src/b.rs",
		rows: [{ path: "/p/src/b.rs", line: 1, text: "// header" }],
	},
];

afterEach(cleanup);

function open(
	onJump: (path: string, line: number) => void = () => {},
	onRemove: (path: string, line: number) => void = () => {},
	onClear: () => void = () => {},
) {
	return render(
		<BookmarksPanel
			groups={groups}
			onJump={(path, line) => onJump(path, line)}
			onRemove={(path, line) => onRemove(path, line)}
			onClear={onClear}
		/>,
	);
}

describe("the bookmarks tool window", () => {
	test("an empty project says so and offers no clear action", () => {
		const view = render(
			<BookmarksPanel groups={[]} onJump={() => {}} onRemove={() => {}} onClear={() => {}} />,
		);
		expect(view.getByText("No bookmarks in this project.")).toBeDefined();
		expect(view.queryByRole("button", { name: "clear all" })).toBeNull();
	});

	test("groups by file and shows line: text", () => {
		const view = open();
		expect(view.getByText("src/a.rs")).toBeDefined();
		expect(view.getByText("src/b.rs")).toBeDefined();
		expect(view.getByText("fn main() {")).toBeDefined();
		expect(view.getByText("9")).toBeDefined();
	});

	test("a row click jumps to the file and line", () => {
		const seen: [string, number][] = [];
		const view = open((path, line) => seen.push([path, line]));
		fireEvent.click(view.getByRole("button", { name: /fn main/ }));
		expect(seen).toEqual([["/p/src/a.rs", 3]]);
	});

	test("a row has its own remove action", () => {
		const seen: [string, number][] = [];
		const view = open(undefined, (path, line) => seen.push([path, line]));
		fireEvent.click(view.getByRole("button", { name: "Remove bookmark at src/a.rs:9" }));
		expect(seen).toEqual([["/p/src/a.rs", 9]]);
	});

	test("clear all is offered only when something is bookmarked", () => {
		const cleared: string[] = [];
		const view = open(undefined, undefined, () => cleared.push("clear"));
		fireEvent.click(view.getByRole("button", { name: "clear all" }));
		expect(cleared).toEqual(["clear"]);
	});
});
