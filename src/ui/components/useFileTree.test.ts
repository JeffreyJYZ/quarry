import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

// A directory that cannot be listed: the read rejects, which is what a New file / New folder action
// hits before it can place a row.
const broken = "/p/broken";

mock.module("@/lib/project/api", () => ({
	listDir: async (path: string) => {
		if (path === broken) throw new Error("permission denied");
		return [];
	},
}));

import { useFileTree } from "@/ui/components/useFileTree";

function harness(notices: string[]) {
	return renderHook(() =>
		useFileTree({
			root: "/p",
			activePath: null,
			onOpenFile: () => {},
			onNotice: (message) => notices.push(message),
		}),
	);
}

afterEach(() => {
	cleanup();
});

describe("a directory that cannot be listed", () => {
	test("reports the failed New file action instead of leaving an unhandled rejection", async () => {
		const notices: string[] = [];
		const view = harness(notices);

		act(() => {
			view.result.current.handleAction(
				{ name: "broken", path: broken, isDir: true },
				"new-file",
			);
		});

		await waitFor(() => expect(notices.length).toBe(1));
		expect(notices[0]).toContain("new file failed");
		expect(notices[0]).toContain("permission denied");
		expect(view.result.current.dirs[broken]).toEqual({
			status: "error",
			message: "permission denied",
		});
	});

	test("reports the failed New folder action the same way", async () => {
		const notices: string[] = [];
		const view = harness(notices);

		act(() => {
			view.result.current.handleAction(
				{ name: "broken", path: broken, isDir: true },
				"new-folder",
			);
		});

		await waitFor(() => expect(notices.length).toBe(1));
		expect(notices[0]).toContain("new folder failed");
		expect(view.result.current.dirs[broken]?.status).toBe("error");
	});
});
