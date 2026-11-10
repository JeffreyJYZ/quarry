import { afterEach, describe, expect, test } from "bun:test";
import type { FileBuffer } from "@/lib/project/buffer";
import { act, cleanup, fireEvent, render } from "@/test/render";
import SplitPicker from "@/ui/app/SplitPicker";
import { type SplitEditor, useSplit } from "@/ui/app/useSplit";

function buffer(path: string): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text: "", loaded: "" };
}

const buffers: FileBuffer[] = [
	buffer("/p/src/main.rs"),
	buffer("/p/tests/main.rs"),
	buffer("/p/src/lib.rs"),
];

afterEach(cleanup);

function open() {
	const picked: string[] = [];
	const view = render(
		<SplitPicker
			buffers={buffers}
			root="/p"
			currentPath="/p/tests/main.rs"
			blockedPath="/p/src/lib.rs"
			onPick={(path) => picked.push(path)}
		/>,
	);
	const expand = () => fireEvent.click(view.getByRole("button", { name: /change the file/i }));
	return { view, picked, expand };
}

describe("the split header's picker", () => {
	test("lists every open buffer, and names the folder only for the duplicated name", () => {
		const { view, expand } = open();
		expand();
		const options = view.getAllByRole("option");
		expect(options.map((option) => option.getAttribute("title"))).toEqual([
			"/p/src/main.rs",
			"/p/tests/main.rs",
			"/p/src/lib.rs",
		]);
		const names = options.map((option) => option.textContent);
		expect(names[0]).toBe("main.rssrc");
		expect(names[1]).toBe("main.rstests");
		expect(names[2]).toBe("lib.rs");
	});

	test("marks the file the split is showing", () => {
		const { view, expand } = open();
		expand();
		const current = view.getByRole("option", { name: "main.rs tests" });
		expect(current.getAttribute("aria-selected")).toBe("true");
		expect(view.getByRole("option", { name: "lib.rs" }).getAttribute("aria-selected")).toBe(
			"false",
		);
	});

	test("refuses the left pane's file and reports the one that was chosen", () => {
		const { view, picked, expand } = open();
		expand();
		const blocked = view.getByRole("option", { name: "lib.rs" });
		expect(blocked.hasAttribute("disabled")).toBe(true);
		expect(blocked.getAttribute("aria-disabled")).toBe("true");
		fireEvent.click(blocked);
		expect(picked).toEqual([]);
		fireEvent.click(view.getByRole("option", { name: "main.rs src" }));
		expect(picked).toEqual(["/p/src/main.rs"]);
	});

	test("closes its list on Escape", () => {
		const { view, expand } = open();
		expand();
		expect(view.queryAllByRole("option").length).toBe(3);
		fireEvent.keyDown(view.getByRole("button", { name: /change the file/i }), {
			key: "Escape",
		});
		expect(view.queryAllByRole("option").length).toBe(0);
	});
});

/** The picker wired to the real hook, so a selection is proven against the split's own state. */
type Sink = { current: SplitEditor | null };

function Host(props: { sink: Sink; activePath: string }) {
	const split = useSplit({ buffers, activePath: props.activePath });
	props.sink.current = split;
	return (
		<SplitPicker
			buffers={buffers}
			root="/p"
			currentPath={split.path}
			blockedPath={props.activePath}
			onPick={split.setPath}
		/>
	);
}

describe("the picker against the split's state", () => {
	test("selecting another buffer moves the pane onto it", () => {
		const sink: Sink = { current: null };
		const view = render(<Host sink={sink} activePath="/p/src/lib.rs" />);
		const api = (): SplitEditor => {
			if (sink.current === null) throw new Error("the split host did not render");
			return sink.current;
		};
		act(() => api().toggle());
		expect(api().path).toBe("/p/tests/main.rs");
		fireEvent.click(view.getByRole("button", { name: /change the file/i }));
		fireEvent.click(view.getByRole("option", { name: "main.rs src" }));
		expect(api().path).toBe("/p/src/main.rs");
		expect(view.queryAllByRole("option").length).toBe(0);
	});

	test("the left pane's own file stays unselectable in that list too", () => {
		const sink: Sink = { current: null };
		const view = render(<Host sink={sink} activePath="/p/src/lib.rs" />);
		act(() => (sink.current as SplitEditor).toggle());
		fireEvent.click(view.getByRole("button", { name: /change the file/i }));
		fireEvent.click(view.getByRole("option", { name: "lib.rs" }));
		expect((sink.current as SplitEditor).path).toBe("/p/tests/main.rs");
	});
});
