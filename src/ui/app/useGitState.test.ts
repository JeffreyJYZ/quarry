import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

mock.module("@/lib/project/api", () => ({
	gitStatus: async () => ({ branch: "main", entries: [] }),
	gitBlame: async () => {
		throw new Error("blame refused");
	},
}));

import { useGitState } from "@/ui/app/useGitState";

afterEach(() => {
	cleanup();
});

describe("blame that cannot be read", () => {
	test("says why the gutter went away instead of flipping it off silently", async () => {
		const notices: string[] = [];
		const view = renderHook(() =>
			useGitState({
				root: "/p",
				activePath: "/p/src/main.rs",
				onNotice: (message) => notices.push(message),
			}),
		);

		act(() => {
			view.result.current.setBlameOn(true);
		});

		await waitFor(() => expect(notices.length).toBe(1));
		expect(notices[0]).toContain("git blame failed");
		expect(notices[0]).toContain("blame refused");
		await waitFor(() => expect(view.result.current.blameOn).toBe(false));
		expect(view.result.current.blameByPath.get("/p/src/main.rs")).toBeUndefined();
	});
});
