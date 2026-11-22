import { describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@/test/render";
import type { ProjectInfo } from "@/lib/project/api";
import { useWorkspace } from "@/ui/app/useWorkspace";

const info: ProjectInfo = {
	root: "/p",
	openedRoot: "/p",
	name: "p",
	kind: "cargo",
	buildRoot: "/p",
	launchConfig: null,
};

let opened = 0;
const onProjectOpened = () => {
	opened += 1;
};

type Workspace = ReturnType<typeof useWorkspace>;
const noop = () => {};
const sink: { current: Workspace | null } = { current: null };

function Probe() {
	sink.current = useWorkspace({
		onNotice: noop,
		onProjectOpened,
		savePaths: async () => true,
		setRevealTarget: noop,
		setRevealToken: noop,
		setReferences: noop,
		setRefsOpen: noop,
		setSearchOpen: noop,
		setQuickOpenOpen: noop,
	});
	return null;
}

function api(): Workspace {
	if (sink.current === null) throw new Error("the probe did not render");
	return sink.current;
}

describe("activating an already inspected project", () => {
	test("takes the same state path a folder open takes, without a second inspect", async () => {
		opened = 0;
		render(<Probe />);
		act(() => {
			api().setBuffers([{ path: "/old/a.rs", name: "a.rs", text: "a", loaded: "a" }]);
			api().setActivePath("/old/a.rs");
			api().setConfirmClose("/old/a.rs");
		});

		// The info comes straight from init_project: activate takes it as an argument, so no
		// open_project round trip is needed for an already inspected folder.
		await act(async () => {
			await api().activate(info, info.openedRoot);
		});

		expect(api().project).toEqual(info);
		expect(api().buffers).toEqual([]);
		expect(api().activePath).toBeNull();
		expect(api().confirmClose).toBeNull();
		expect(opened).toBe(1);
		cleanup();
	});
});
