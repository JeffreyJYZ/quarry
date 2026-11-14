import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { runBackend } from "@/test/runBackend";

/**
 * The control the second-run message sends users to: the Run form's `program` field.
 *
 * A hand-set program is only session state unless the shell persists it the way it persists a saved
 * configuration, so a restart drops it and the field falls back to the detected default.
 */

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: Record<string, unknown>) => {
		if (command === "default_launch_config") {
			return {
				program: "/p/build/alpha",
				args: [],
				cwd: "/p",
				stopOnEntry: false,
				initCommands: [],
			};
		}
		return runBackend.invoke(command, args);
	},
}));
mock.module("@tauri-apps/api/event", () => ({ listen: runBackend.listen }));

import type { RunFormEntry } from "@/lib/project/api";
import { useRunControls } from "@/ui/app/useRunControls";

function setup(initialRunForms: RunFormEntry[] = []) {
	const saved: RunFormEntry[][] = [];
	const view = renderHook(() =>
		useRunControls({
			root: "/p",
			initialConfigurations: [],
			onConfigurationsChange: () => {},
			onNotice: () => {},
			initialRunForms,
			onRunFormsChange: (next) => saved.push(next),
		}),
	);
	return { view, saved };
}

/** Mounted and past the form's restore of the default launch configuration. */
async function ready(initialRunForms: RunFormEntry[] = []) {
	const mounted = setup(initialRunForms);
	await waitFor(() => expect(mounted.view.result.current.program).toBe("/p/build/alpha"));
	return mounted;
}

function entryFor(saved: RunFormEntry[][]): RunFormEntry {
	const entries = saved.at(-1) ?? [];
	const entry = entries.find((candidate) => candidate.root === "/p");
	if (entry === undefined) throw new Error("the form never reported its state");
	return entry;
}

afterEach(() => {
	cleanup();
	runBackend.reset();
});

describe("a program set in the run form", () => {
	test("is the form's next run after the default was restored", async () => {
		const { view } = await ready();

		act(() => {
			view.result.current.setProgram("/p/custom");
			view.result.current.setArgs("");
			view.result.current.setCwd("/p");
		});
		await act(async () => {
			await view.result.current.run();
		});

		expect(runBackend.starts.map((start) => start.program)).toEqual(["/p/custom"]);
	});

	test("is reported to the shell so a restart can restore it", async () => {
		const first = await ready();

		act(() => {
			first.view.result.current.setProgram("/p/custom");
			first.view.result.current.setArgs("--manual");
			first.view.result.current.setCwd("/p/sub");
		});

		await waitFor(() => expect(entryFor(first.saved).program).toBe("/p/custom"));
		expect(entryFor(first.saved).args).toBe("--manual");
		expect(entryFor(first.saved).cwd).toBe("/p/sub");
		cleanup();

		const second = setup([entryFor(first.saved)]);
		await waitFor(() => expect(second.view.result.current.program).toBe("/p/custom"));
		expect(second.view.result.current.args).toBe("--manual");
		expect(second.view.result.current.cwd).toBe("/p/sub");
	});

	test("a saved program survives the default configuration arriving later", async () => {
		const second = setup([{ root: "/p", program: "/p/custom", args: "", cwd: "/p", env: [] }]);

		await waitFor(() => expect(second.view.result.current.program).toBe("/p/custom"));
		// The restore of the backend default must not overwrite what the file held.
		await act(async () => {});
		expect(second.view.result.current.program).toBe("/p/custom");
	});
});
