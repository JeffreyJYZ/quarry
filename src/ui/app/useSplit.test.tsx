import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@/test/render";
import { PANEL_LIMITS } from "@/lib/consts/layout";
import type { FileBuffer } from "@/lib/project/buffer";
import { type SplitEditor, useSplit } from "@/ui/app/useSplit";

function buffer(path: string): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text: "", loaded: "" };
}

/** What the probe last rendered: the hook's value, read by each assertion. */
type Sink = { current: SplitEditor | null };

/** A module-level probe, so re-rendering it is the same component with new props. */
function Probe(props: { buffers: FileBuffer[]; activePath: string | null; sink: Sink }) {
	props.sink.current = useSplit(props);
	return null;
}

function harness(options: { buffers: FileBuffer[]; activePath: string | null }) {
	const sink: Sink = { current: null };

	const view = render(<Probe {...options} sink={sink} />);
	const api = (): SplitEditor => {
		if (sink.current === null) throw new Error("the split probe did not render");
		return sink.current;
	};
	const rerender = (next: { buffers: FileBuffer[]; activePath: string | null }) => {
		view.rerender(<Probe {...next} sink={sink} />);
	};
	return { api, rerender };
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
		expect(h.api().open).toBe(true);
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

	test("opens with nothing on show when only one file is open, instead of refusing", () => {
		const h = harness({ buffers: [buffer("/p/a.rs")], activePath: "/p/a.rs" });
		act(() => h.api().toggle());
		expect(h.api().open).toBe(true);
		expect(h.api().path).toBeNull();
	});

	test("points at whatever the picker names, never the left pane's file", () => {
		const h = harness({
			buffers: [buffer("/p/a.rs"), buffer("/p/b.rs"), buffer("/p/c.rs")],
			activePath: "/p/a.rs",
		});
		act(() => h.api().toggle());
		expect(h.api().path).toBe("/p/c.rs");
		act(() => h.api().setPath("/p/b.rs"));
		expect(h.api().path).toBe("/p/b.rs");
		act(() => h.api().setPath("/p/a.rs"));
		expect(h.api().path).toBe("/p/b.rs");
	});

	test("hands the pane another file when the left pane opens its own", () => {
		const a = buffer("/p/a.rs");
		const b = buffer("/p/b.rs");
		const h = harness({ buffers: [a, b], activePath: a.path });
		act(() => h.api().toggle());
		expect(h.api().path).toBe(b.path);
		h.rerender({ buffers: [a, b], activePath: b.path });
		expect(h.api().path).toBe(a.path);
	});

	test("closes again when it is already open", () => {
		const h = harness({
			buffers: [buffer("/p/a.rs"), buffer("/p/b.rs")],
			activePath: "/p/a.rs",
		});
		act(() => h.api().toggle());
		act(() => h.api().toggle());
		expect(h.api().open).toBe(false);
		expect(h.api().path).toBeNull();
	});

	test("empties instead of showing a buffer that was closed, then fills on the next file", () => {
		const a = buffer("/p/a.rs");
		const b = buffer("/p/b.rs");
		const c = buffer("/p/c.rs");
		const h = harness({ buffers: [a, b], activePath: a.path });
		act(() => h.api().toggle());
		expect(h.api().path).toBe(b.path);
		h.rerender({ buffers: [a], activePath: a.path });
		expect(h.api().open).toBe(true);
		expect(h.api().path).toBeNull();
		h.rerender({ buffers: [a, c], activePath: a.path });
		expect(h.api().path).toBe(c.path);
	});

	test("keeps its width inside the published limits", () => {
		const h = harness({ buffers: [buffer("/p/a.rs")], activePath: "/p/a.rs" });
		act(() => h.api().setWidth(1));
		expect(h.api().width).toBe(PANEL_LIMITS.splitWidth.min);
		act(() => h.api().setWidth(9999));
		expect(h.api().width).toBe(PANEL_LIMITS.splitWidth.max);
	});
});
