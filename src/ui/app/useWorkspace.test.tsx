import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { FileBuffer } from "@/lib/project/buffer";
import { useWorkspace } from "@/ui/app/useWorkspace";

const noop = () => {};

function buffer(path: string, text: string): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text, loaded: text };
}

/** Inert shell options: nothing here reaches the backend, so only the writers are under test. */
function options() {
	return {
		onNotice: mock((_message: string | null) => {}),
		onProjectOpened: noop,
		savePaths: async () => true,
		setRevealTarget: noop,
		setRevealToken: noop,
		setReferences: noop,
		setRefsOpen: noop,
		setSearchOpen: noop,
		setQuickOpenOpen: noop,
	};
}

type Options = ReturnType<typeof options>;
type Workspace = ReturnType<typeof useWorkspace>;
type Sink = { current: Workspace | null };

/** A module-level probe, so re-rendering it is the same component with new props. */
function Probe(props: { options: Options; sink: Sink }) {
	props.sink.current = useWorkspace(props.options);
	return null;
}

function harness(): () => Workspace {
	const sink: Sink = { current: null };
	render(<Probe options={options()} sink={sink} />);
	return () => {
		if (sink.current === null) throw new Error("the workspace probe did not render");
		return sink.current;
	};
}

afterEach(() => {
	cleanup();
});

describe("typing in the split pane", () => {
	test("writes the named buffer and leaves the active one alone", () => {
		const api = harness();
		act(() => {
			api().setBuffers([buffer("/p/a.rs", "a"), buffer("/p/b.rs", "b")]);
			api().setActivePath("/p/a.rs");
		});

		act(() => api().handleChangeFor("/p/b.rs", "b2"));

		expect(api().activePath).toBe("/p/a.rs");
		expect(api().buffers.map((entry) => [entry.path, entry.text])).toEqual([
			["/p/a.rs", "a"],
			["/p/b.rs", "b2"],
		]);
	});

	test("the left pane still writes the active buffer, so the two writers never collide", () => {
		const api = harness();
		act(() => {
			api().setBuffers([buffer("/p/a.rs", "a"), buffer("/p/b.rs", "b")]);
			api().setActivePath("/p/a.rs");
		});

		act(() => api().handleChangeFor("/p/b.rs", "b2"));
		act(() => api().handleChange("a2"));

		expect(api().buffers.map((entry) => [entry.path, entry.text])).toEqual([
			["/p/a.rs", "a2"],
			["/p/b.rs", "b2"],
		]);
	});
});
