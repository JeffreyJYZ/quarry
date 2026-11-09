import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";

type Config = {
	program: string;
	args: string[];
	cwd: string;
	stopOnEntry: boolean;
	initCommands: string[];
};

const configs: Record<string, Config> = {
	"/p/a": {
		program: "/p/a/target/debug/app",
		args: ["--name", "two words"],
		cwd: "/p/a",
		stopOnEntry: false,
		initCommands: [],
	},
	"/p/b": {
		program: "/p/b/build/app",
		args: [],
		cwd: "/p/b",
		stopOnEntry: false,
		initCommands: [],
	},
};

mock.module("@/lib/project/api", () => ({
	defaultLaunchConfig: async (root: string) => configs[root],
}));

import { splitArgs } from "@/lib/run/splitArgs";
import { type RunFormState, useRunFormMemory } from "@/ui/app/useRunFormMemory";

/** The hook as the shell drives it: the restore writes straight back into the form it reads. */
function useForm(root: string | null) {
	const [form, setForm] = useState<RunFormState>({ program: "", args: "", cwd: "", env: [] });
	useRunFormMemory({ root, form, onRestore: setForm });
	return { form, setForm };
}

describe("useRunFormMemory", () => {
	afterEach(() => {
		cleanup();
	});

	test("a default argument containing a space survives a project switch quoted", async () => {
		const { result, rerender } = renderHook(({ root }) => useForm(root), {
			initialProps: { root: "/p/a" },
		});

		await waitFor(() => expect(result.current.form.args).toBe('--name "two words"'));
		expect(splitArgs(result.current.form.args)).toEqual(["--name", "two words"]);

		rerender({ root: "/p/b" });
		await waitFor(() => expect(result.current.form.program).toBe("/p/b/build/app"));

		rerender({ root: "/p/a" });
		await waitFor(() => expect(result.current.form.args).toBe('--name "two words"'));
		expect(splitArgs(result.current.form.args)).toEqual(["--name", "two words"]);
	});

	test("an edited program survives a project switch", async () => {
		const { result, rerender } = renderHook(({ root }) => useForm(root), {
			initialProps: { root: "/p/a" },
		});

		await waitFor(() => expect(result.current.form.program).toBe("/p/a/target/debug/app"));
		act(() => {
			result.current.setForm((current) => ({ ...current, program: "/p/a/custom-app" }));
		});

		rerender({ root: "/p/b" });
		await waitFor(() => expect(result.current.form.program).toBe("/p/b/build/app"));

		rerender({ root: "/p/a" });
		await waitFor(() => expect(result.current.form.program).toBe("/p/a/custom-app"));
		expect(result.current.form.args).toBe('--name "two words"');
	});
});
