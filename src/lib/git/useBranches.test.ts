import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

mock.module("@/lib/project/api", () => ({
	gitBranches: async () => {
		throw new Error("refused: cannot read refs");
	},
	gitCheckout: async () => undefined,
	gitFileDiff: async () => "",
}));

import { useBranches } from "@/lib/git/useBranches";
import type { SetError } from "@/lib/git/useChanges";

afterEach(() => {
	cleanup();
});

describe("a branch list that cannot be read", () => {
	test("surfaces the reason through the picker's error channel and still lists nothing", async () => {
		const errors: string[] = [];
		const setError: SetError = (value) => {
			errors.push(typeof value === "function" ? (value(null) ?? "") : (value ?? ""));
		};
		const view = renderHook(() =>
			useBranches({
				root: "/p",
				setError,
				onRefresh: async () => {},
				loadHistory: async () => {},
				historyLimit: 50,
				diffPath: null,
				onDiff: () => {},
				onCommitDiff: () => {},
			}),
		);

		await waitFor(() => expect(errors.length).toBe(1));
		expect(errors[0]).toContain("branch list failed");
		expect(errors[0]).toContain("refused: cannot read refs");
		await waitFor(() => expect(view.result.current.branches).toEqual([]));
	});
});
