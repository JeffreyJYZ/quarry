import "@/test/render";
import { describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@/test/render";
import { todoFiles } from "@/lib/todo/model";
import type { TodoController } from "@/lib/todo/useTodos";
import TodoPanel from "@/ui/todo/TodoPanel";

function controller(files: TodoController["files"]): TodoController {
	return {
		files,
		count: files.reduce((total, file) => total + file.rows.length, 0),
		loading: false,
		error: null,
		truncated: false,
		refresh: mock(() => {}),
		noteSaved: mock(() => {}),
	};
}

const scanned = todoFiles([
	{ path: "/p/src/main.rs", line: 4, column: 1, text: "// TODO: wire the pump" },
	{ path: "/p/src/main.rs", line: 9, column: 1, text: "// FIXME: leak in the reader" },
	{ path: "/p/src/lib.rs", line: 2, column: 1, text: "// HACK around the borrow checker" },
]);

describe("the TODO panel", () => {
	test("lists every file with its count, and each row as line and text", () => {
		const view = render(
			<TodoPanel
				todo={controller(scanned)}
				activePath="/p/src/main.rs"
				onSelect={() => {}}
			/>,
		);

		expect(view.getByText("main.rs")).toBeDefined();
		expect(view.getByText("lib.rs")).toBeDefined();
		expect(view.getByText("2")).toBeDefined();
		expect(view.getByText("4:")).toBeDefined();
		expect(view.getByText("// FIXME: leak in the reader")).toBeDefined();
		expect(view.container.querySelector(".todo-counts")?.textContent).toBe(
			"3 markers in 2 files",
		);
		cleanup();
	});

	test("the filter narrows the rows and the count follows the list", async () => {
		const view = render(
			<TodoPanel todo={controller(scanned)} activePath={null} onSelect={() => {}} />,
		);

		fireEvent.input(view.getByLabelText("Filter TODO markers"), {
			target: { value: "borrow" },
		});

		await waitFor(() =>
			expect(view.container.querySelector(".todo-counts")?.textContent).toBe(
				"1 marker in 1 file",
			),
		);
		expect(view.queryByText("// TODO: wire the pump")).toBeNull();
		expect(view.getByText("lib.rs")).toBeDefined();
		cleanup();
	});

	test("says no markers found when the scan found none", () => {
		const view = render(
			<TodoPanel todo={controller([])} activePath={null} onSelect={() => {}} />,
		);

		expect(view.getByText("No TODO, FIXME, HACK, XXX markers found")).toBeDefined();
		cleanup();
	});

	test("says no markers match the filter rather than no markers found", async () => {
		const view = render(
			<TodoPanel todo={controller(scanned)} activePath={null} onSelect={() => {}} />,
		);

		fireEvent.input(view.getByLabelText("Filter TODO markers"), {
			target: { value: "zzz" },
		});

		await waitFor(() =>
			expect(view.container.querySelector(".todo-empty")?.textContent).toBe(
				'No markers match the filter "zzz"',
			),
		);
		cleanup();
	});

	test("a click navigates to that row's line", () => {
		const onSelect = mock((_path: string, _line?: number, _character?: number) => {});
		const view = render(
			<TodoPanel todo={controller(scanned)} activePath={null} onSelect={onSelect} />,
		);

		fireEvent.click(view.getByText("// FIXME: leak in the reader"));

		// ripgrep's line 9 is the editor's line 8, and the row is in main.rs.
		expect(onSelect).toHaveBeenCalledWith("/p/src/main.rs", 8, 0);
		cleanup();
	});

	test("the refresh button asks for a rescan", () => {
		const todo = controller(scanned);
		const view = render(<TodoPanel todo={todo} activePath={null} onSelect={() => {}} />);

		fireEvent.click(view.getByText("refresh"));

		expect(todo.refresh).toHaveBeenCalledTimes(1);
		cleanup();
	});

	test("the scanning state is not reported as an empty project", () => {
		const view = render(
			<TodoPanel
				todo={{ ...controller([]), loading: true }}
				activePath={null}
				onSelect={() => {}}
			/>,
		);

		expect(view.getByText("Scanning for TODO, FIXME, HACK, XXX markers…")).toBeDefined();
		cleanup();
	});
});
