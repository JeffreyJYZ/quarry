import { afterEach, describe, expect, mock, test } from "bun:test";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { act, cleanup, fireEvent, render, waitFor } from "@/test/render";
import StructurePalette from "@/ui/structure/StructurePalette";

type Props = Parameters<typeof StructurePalette>[0];

const FILE = "/p/src/lib.rs";

function sym(name: string, line: number, kind = 12, depth = 0): LspSymbol {
	return {
		name,
		kind,
		range: { start: { line, character: 0 }, end: { line: line + 1, character: 1 } },
		depth,
	};
}

function source(symbols: LspSymbol[]): NonNullable<Props["load"]> {
	return async () => symbols;
}

function base(overrides: Partial<Props> = {}): Props {
	return {
		activePath: FILE,
		session: "rust-analyzer::/p",
		cursor: null,
		onNavigate: () => {},
		onClose: () => {},
		load: source([sym("main", 0), sym("helper", 4)]),
		...overrides,
	};
}

function input(view: ReturnType<typeof render>) {
	return view.getByLabelText("Filter symbols");
}

afterEach(() => {
	cleanup();
});

describe("the File Structure popup", () => {
	test("says there is no file open rather than drawing an empty list", () => {
		const view = render(<StructurePalette {...base({ activePath: null, session: null })} />);
		expect(view.getByRole("status").textContent).toBe("No file open.");
	});

	test("says the file has no language server and asks nobody for symbols", async () => {
		const load = mock(async () => [] as LspSymbol[]);
		const view = render(<StructurePalette {...base({ session: null, load })} />);
		expect(view.getByRole("status").textContent).toBe("No language server for this file.");
		expect(load).not.toHaveBeenCalled();
	});

	test("says the server returned nothing for the file", async () => {
		const view = render(<StructurePalette {...base({ load: source([]) })} />);
		await waitFor(() => expect(view.getByRole("status").textContent).toContain("returned no"));
	});

	test("lists the symbols and Enter jumps to the selected one", async () => {
		const onNavigate = mock((_path: string, _line: number, _character: number) => {});
		const onClose = mock(() => {});
		const view = render(<StructurePalette {...base({ onNavigate, onClose })} />);
		await waitFor(() => expect(view.getByText("helper")).toBeTruthy());

		fireEvent.keyDown(input(view), { key: "ArrowDown" });
		fireEvent.keyDown(input(view), { key: "Enter" });

		expect(onNavigate).toHaveBeenCalledWith(FILE, 4, 0);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("typing filters by name", async () => {
		const view = render(<StructurePalette {...base()} />);
		await waitFor(() => expect(view.getByText("helper")).toBeTruthy());

		fireEvent.input(input(view), { target: { value: "help" } });

		expect(view.queryByText("main")).toBeNull();
		expect(view.getByText("helper")).toBeTruthy();
	});

	test("typing filters by kind", async () => {
		const view = render(
			<StructurePalette {...base({ load: source([sym("run", 0, 6), sym("helper", 4)]) })} />,
		);
		await waitFor(() => expect(view.getByText("helper")).toBeTruthy());

		fireEvent.input(input(view), { target: { value: "method" } });

		expect(view.queryByText("helper")).toBeNull();
		expect(view.getByText("run")).toBeTruthy();
	});

	test("opens with the caret's symbol highlighted", async () => {
		const view = render(<StructurePalette {...base({ cursor: { line: 4, character: 0 } })} />);
		await waitFor(() => expect(view.getByText("helper")).toBeTruthy());
		expect(view.getByText("helper").closest("button")?.className).toContain("active");
		expect(view.getByText("main").closest("button")?.className).not.toContain("active");
	});

	test("Escape closes it", async () => {
		const onClose = mock(() => {});
		const view = render(<StructurePalette {...base({ onClose })} />);
		await waitFor(() => expect(view.getByText("helper")).toBeTruthy());
		fireEvent.keyDown(input(view), { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("a reply for the previous file is dropped instead of shown", async () => {
		const pending: ((value: LspSymbol[]) => void)[] = [];
		const load = () =>
			new Promise<LspSymbol[]>((resolve) => {
				pending.push(resolve);
			});
		const view = render(<StructurePalette {...base({ load })} />);
		const other = "/p/src/other.rs";
		view.rerender(<StructurePalette {...base({ load, activePath: other })} />);
		await waitFor(() => expect(pending.length).toBe(2));

		// The new file's rows replace the old file's the moment the target changes.
		expect(view.queryByText("main")).toBeNull();

		await act(async () => {
			pending[0]?.([sym("stale", 1)]);
		});
		await act(async () => {
			pending[1]?.([sym("fresh", 1)]);
		});

		expect(view.queryByText("stale")).toBeNull();
		expect(view.getByText("fresh")).toBeTruthy();
	});
});
