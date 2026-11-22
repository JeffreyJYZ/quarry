import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const opened: string[] = [];
const closed: string[] = [];

// No real PTY: a restart's chosen cwd is the only thing under test.
mock.module("@/lib/project/api", () => ({
	ptyOpen: async (cwd: string) => {
		opened.push(cwd);
		return { id: `pty:${cwd}`, pid: opened.length };
	},
	ptyClose: async (id: string) => {
		closed.push(id);
	},
	listDir: async () => [],
}));

import { emptySession } from "@/lib/terminal/sessions";
import { useTerminalRestart } from "@/ui/terminal/useTerminalRestart";

const containerRef = { current: null };

function harness(options: {
	root: string;
	cwd: string;
	activePath: string | null;
	dirExists: (path: string) => Promise<boolean>;
}) {
	const session = {
		...emptySession(1, options.cwd),
		ptyId: "pty:old",
		pid: 7,
		opening: false,
	};
	return renderHook(() =>
		useTerminalRestart({
			root: options.root,
			activePath: options.activePath,
			activeId: 1,
			sessions: [session],
			containerRef,
			updateSession: () => undefined,
			dirExists: options.dirExists,
		}),
	);
}

afterEach(() => {
	cleanup();
	opened.length = 0;
	closed.length = 0;
});

describe("restart keeps the shell where it was opened", () => {
	test("a stored cwd still on disk wins over the active file's directory", async () => {
		const view = harness({
			root: "/proj",
			cwd: "/proj/src",
			activePath: "/proj/docs/readme.md",
			dirExists: async () => true,
		});

		act(() => {
			view.result.current();
		});

		await waitFor(() => expect(opened).toEqual(["/proj/src"]));
		expect(closed).toEqual(["pty:old"]);
	});

	test("a stored cwd that is gone falls back to the root, not the active file", async () => {
		const view = harness({
			root: "/proj",
			cwd: "/proj/src",
			activePath: "/proj/docs/readme.md",
			dirExists: async () => false,
		});

		act(() => {
			view.result.current();
		});

		await waitFor(() => expect(opened).toEqual(["/proj"]));
	});
});
