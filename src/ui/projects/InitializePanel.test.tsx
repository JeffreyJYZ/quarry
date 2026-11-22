import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@/test/render";
import type { ProjectInfo } from "@/lib/project/api";
import InitializePanel from "@/ui/projects/InitializePanel";

const info: ProjectInfo = {
	root: "/p",
	openedRoot: "/p",
	name: "p",
	kind: "cargo",
	buildRoot: "/p",
	launchConfig: null,
};

const init = mock(async (_root: string, _kind: string, _standard: string) => info);

function setup() {
	const onInitialized = mock((_info: ProjectInfo) => {});
	const onNotice = mock((_message: string | null) => {});
	const view = render(
		<InitializePanel root="/p" onInitialized={onInitialized} onNotice={onNotice} init={init} />,
	);
	return { view, onInitialized, onNotice };
}

describe("initialize an unknown folder", () => {
	afterEach(() => cleanup());
	beforeEach(() => {
		init.mockImplementation(async () => info);
		init.mockClear();
	});

	it("offers the four kinds and the chosen standard before scaffolding", async () => {
		const { view, onInitialized } = setup();
		fireEvent.click(view.getByRole("button", { name: "Initialize project" }));

		for (const label of ["Rust binary", "Rust library", "C (CMake)", "C++ (CMake)"]) {
			expect(view.getByText(label)).toBeTruthy();
		}
		const radio = (kind: string) =>
			view.container.querySelector(
				`input[type="radio"][value="${kind}"]`,
			) as HTMLInputElement;
		expect(radio("rust-bin").checked).toBe(true);
		fireEvent.click(radio("cpp-cmake"));
		expect(radio("cpp-cmake").checked).toBe(true);
		expect((view.getByLabelText("Language standard") as HTMLSelectElement).value).toBe("20");

		fireEvent.click(view.getByRole("button", { name: "Initialize" }));
		await waitFor(() => expect(init).toHaveBeenCalledWith("/p", "cpp-cmake", "20"));
		await waitFor(() => expect(onInitialized).toHaveBeenCalledWith(info));
	});

	it("surfaces the backend message when the folder is refused", async () => {
		init.mockImplementation(async () => {
			throw "folder is not empty";
		});
		const { view, onInitialized, onNotice } = setup();
		fireEvent.click(view.getByRole("button", { name: "Initialize project" }));
		fireEvent.click(view.getByRole("button", { name: "Initialize" }));

		await waitFor(() => expect(onNotice).toHaveBeenCalledWith("folder is not empty"));
		expect(view.getByRole("alert").textContent).toBe("folder is not empty");
		expect(onInitialized).not.toHaveBeenCalled();
	});
});
