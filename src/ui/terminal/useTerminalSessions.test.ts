import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const closed: string[] = [];
const opened: string[] = [];

// No real PTY: the shell calls are recorded so a teardown is visible without a process behind it.
mock.module("@/lib/project/api", () => ({
	ptyOpen: async (cwd: string) => {
		opened.push(cwd);
		return { id: `pty:${cwd}`, pid: opened.length };
	},
	ptyClose: async (id: string) => {
		closed.push(id);
	},
	ptyWrite: async () => undefined,
	onPtyOutput: async () => () => undefined,
	onPtyExited: async () => () => undefined,
}));

import { useTerminalSessions } from "@/ui/terminal/useTerminalSessions";

const containerRef = { current: null };

function harness(root: string, activePath: string | null = null) {
	return renderHook(
		({ root, activePath }: { root: string; activePath: string | null }) =>
			useTerminalSessions({
				root,
				activePath,
				defaultFontSize: 12,
				containerRef,
			}),
		{ initialProps: { root, activePath } },
	);
}

afterEach(() => {
	cleanup();
	closed.length = 0;
	opened.length = 0;
});

describe("terminal sessions across a project root change", () => {
	test("root change closes the old project's shells and opens one in the new root", async () => {
		const view = harness("/one");
		act(() => {
			void view.result.current.openSession();
		});
		await waitFor(() => expect(view.result.current.sessions[0]?.ptyId).toBe("pty:/one"));

		await act(async () => {
			view.rerender({ root: "/two", activePath: null });
		});

		await waitFor(() => expect(closed).toContain("pty:/one"));
		await waitFor(() => expect(opened).toContain("/two"));
		await waitFor(() =>
			expect(view.result.current.sessions.map((s) => s.cwd)).toEqual(["/two"]),
		);
	});

	test("unmounting closes every shell it opened", async () => {
		const view = harness("/one");
		act(() => {
			void view.result.current.openSession();
		});
		await waitFor(() => expect(view.result.current.sessions[0]?.ptyId).toBe("pty:/one"));

		view.unmount();

		await waitFor(() => expect(closed).toContain("pty:/one"));
	});
});

describe("default cwd for a new terminal", () => {
	test("a file open in src does not pull a new shell into src", async () => {
		const view = harness("/proj", "/proj/src/main.cpp");
		act(() => {
			void view.result.current.openSession();
		});

		await waitFor(() => expect(view.result.current.sessions[0]?.ptyId).toBe("pty:/proj"));
		expect(opened).toEqual(["/proj"]);
		expect(view.result.current.sessions[0]?.cwd).toBe("/proj");
	});

	test("no active file opens at the root too", async () => {
		const view = harness("/proj");
		act(() => {
			void view.result.current.openSession();
		});

		await waitFor(() => expect(view.result.current.sessions[0]?.ptyId).toBe("pty:/proj"));
		expect(opened).toEqual(["/proj"]);
	});
});
