import "@/test/render";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { act, cleanup, waitFor } from "@/test/render";
import type { SearchReport } from "@/lib/project/api";
import { TODO_PATTERN } from "@/lib/todo/model";

/**
 * The scanner the hook calls.
 *
 * The factory below runs while the module graph loads, so it must not capture this binding: it
 * forwards at call time instead, which is when the spy exists.
 */
var scan: ReturnType<typeof mock>;

mock.module("@/lib/project/api", () => ({
	searchProject: (root: string, query: string, maxResults?: number) =>
		scan(root, query, maxResults),
}));

import { useTodos } from "@/lib/todo/useTodos";

function report(path: string): SearchReport {
	return {
		matches: [{ path, line: 3, column: 1, text: "// TODO: wire the pump" }],
		truncated: false,
		durationMs: 1,
	};
}

beforeEach(() => {
	scan = mock(async () => report("/p/main.rs"));
});

describe("when the list is scanned", () => {
	test("once when a project opens, with the marker pattern", async () => {
		const view = renderHook(() => useTodos("/p"));

		await waitFor(() => expect(view.result.current.files.length).toBe(1));
		expect(scan).toHaveBeenCalledTimes(1);
		expect(scan.mock.calls[0][1]).toBe(TODO_PATTERN);
		expect(view.result.current.count).toBe(1);
		cleanup();
	});

	test("not at all while no project is open", () => {
		const view = renderHook(() => useTodos(null));

		expect(view.result.current.files).toEqual([]);
		expect(view.result.current.loading).toBe(false);
		expect(scan).not.toHaveBeenCalled();
		cleanup();
	});

	test("again on a refresh", async () => {
		const view = renderHook(() => useTodos("/p"));
		await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));

		act(() => view.result.current.refresh());

		await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
		cleanup();
	});

	test("again after a save of a file the list names", async () => {
		const view = renderHook(() => useTodos("/p"));
		await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));

		act(() => view.result.current.noteSaved("/p/main.rs"));

		await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
		cleanup();
	});

	test("not after a save of a file the list does not name", async () => {
		const view = renderHook(() => useTodos("/p"));
		await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));

		act(() => view.result.current.noteSaved("/p/notes.md"));

		expect(scan).toHaveBeenCalledTimes(1);
		cleanup();
	});
});

describe("a scan that fails", () => {
	test("reports the reason and lists nothing", async () => {
		scan = mock(async () => {
			throw new Error("ripgrep (rg) is not installed");
		});
		const view = renderHook(() => useTodos("/p"));

		await waitFor(() => expect(view.result.current.error).toContain("not installed"));
		expect(view.result.current.files).toEqual([]);
		expect(view.result.current.loading).toBe(false);
		cleanup();
	});
});
