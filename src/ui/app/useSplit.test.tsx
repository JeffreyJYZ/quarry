import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { PANEL_LIMITS } from "@/lib/consts/layout";
import type { FileBuffer } from "@/lib/project/buffer";
import { SPLIT_NEEDS_ANOTHER_FILE, type SplitEditor, useSplit } from "@/ui/app/useSplit";

function buffer(path: string): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text: "", loaded: "" };
}

/** What the probe last rendered: the hook's value, read by each assertion. */
type Sink = { current: SplitEditor | null };

/** A module-level probe, so re-rendering it is the same component with new props. */
function Probe(props: {
	buffers: FileBuffer[];
	activePath: string | null;
	onNotice: (message: string | null) => void;
	sink: Sink;
}) {
	props.sink.current = useSplit(props);
	return null;
}

function harness(options: { buffers: FileBuffer[]; activePath: string | null }) {
	const onNotice = mock((_message: string | null) => {});
	const sink: Sink = { current: null };

	const view = render(<Probe {...options} onNotice={onNotice} sink={sink} />);
	const api = (): SplitEditor => {
		if (sink.current === null) throw new Error("the split probe did not render");
		return sink.current;
	};
	const rerender = (next: { buffers: FileBuffer[]; activePath: string | null }) => {
		view.rerender(<Probe {...next} onNotice={onNotice} sink={sink} />);
	};
	return { onNotice, api, rerender };
}

afterEach(() => {
	cleanup();
});

describe("the split editor's state", () => {
	test("opens on the other open buffer, not the active one", () => {
		const h = harness({
			buffers: [buffer("/p/a.rs"), buffer("/p/b.rs")],
			activePath: "/p/a.rs",
		});
		act(() => h.api().toggle());
		expect(h.api().path).toBe("/p/b.rs");
	});

	test("prefers the file read most recently over the last tab in the row", () => {
		const buffers = [buffer("/p/a.rs"), buffer("/p/b.rs"), buffer("/p/c.rs")];
		const h = harness({ buffers, activePath: "/p/a.rs" });
		// a -> b -> a leaves b as the most recently read file that is not active; the last other
		// tab in the row is c, so the two answers are distinguishable.
		h.rerender({ buffers, activePath: "/p/b.rs" });
		h.rerender({ buffers, activePath: "/p/a.rs" });
		act(() => h.api().toggle());
		expect(h.api().path).toBe("/p/b.rs");
	});

	test("refuses with only one file open, and says what to do", () => {
		const h = harness({ buffers: [buffer("/p/a.rs")], activePath: "/p/a.rs" });
		act(() => h.api().toggle());
		expect(h.api().path).toBeNull();
		expect(h.onNotice).toHaveBeenCalledWith(SPLIT_NEEDS_ANOTHER_FILE);
		expect(SPLIT_NEEDS_ANOTHER_FILE).toBe("Open another file to split the editor");
	});

	test("closes again when it is already open", () => {
		const h = harness({
			buffers: [buffer("/p/a.rs"), buffer("/p/b.rs")],
			activePath: "/p/a.rs",
		});
		act(() => h.api().toggle());
		expect(h.api().path).toBe("/p/b.rs");
		act(() => h.api().toggle());
		expect(h.api().path).toBeNull();
	});

	test("drops the pane when the buffer it shows is closed", () => {
		const a = buffer("/p/a.rs");
		const b = buffer("/p/b.rs");
		const h = harness({ buffers: [a, b], activePath: a.path });
		act(() => h.api().toggle());
		expect(h.api().path).toBe("/p/b.rs");
		h.rerender({ buffers: [a], activePath: a.path });
		expect(h.api().path).toBeNull();
	});

	test("keeps its width inside the published limits", () => {
		const h = harness({ buffers: [buffer("/p/a.rs")], activePath: "/p/a.rs" });
		act(() => h.api().setWidth(1));
		expect(h.api().width).toBe(PANEL_LIMITS.splitWidth.min);
		act(() => h.api().setWidth(9999));
		expect(h.api().width).toBe(PANEL_LIMITS.splitWidth.max);
	});
});
