import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { runBackend } from "@/test/runBackend";
import type { EnvVar, LaunchConfig } from "@/lib/project/api";

// The seam, not the hooks: mocking `@/lib/run/useRunProcess` here would swap it for every test file
// that loads the Run panel after this one.
mock.module("@tauri-apps/api/core", () => ({ invoke: runBackend.invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen: runBackend.listen }));

import { useRunControls } from "@/ui/app/useRunControls";

const target: LaunchConfig = {
	program: "/p/target/debug/app",
	args: [],
	cwd: "/p",
	stopOnEntry: false,
	initCommands: [],
};

const leftover: EnvVar[] = [{ name: "RUST_LOG", value: "trace" }];

function setup() {
	return renderHook(() =>
		useRunControls({
			root: "/p",
			initialConfigurations: [],
			onConfigurationsChange: () => {},
			onNotice: () => {},
		}),
	);
}

/** Mounted and past the form's own restore, so setting the form below is the last write. */
async function ready() {
	const view = setup();
	await waitFor(() => expect(runBackend.sinks["run://output"]?.length ?? 0).toBe(1));
	await act(async () => {});
	return view;
}

afterEach(() => {
	cleanup();
	runBackend.reset();
});

describe("a run's environment rows", () => {
	test("a detected target passes none of the rows a saved configuration left in the form", async () => {
		const view = await ready();

		act(() => {
			view.result.current.setProgram("/p/target/debug/other");
			view.result.current.setArgs("");
			view.result.current.setCwd("/p");
			view.result.current.setEnv(leftover);
		});

		await act(async () => {
			await view.result.current.runConfig(target);
		});

		expect(runBackend.starts).toEqual([
			{ program: target.program, args: [], cwd: "/p", env: [] },
		]);
	});

	test("a saved configuration still passes its own rows", async () => {
		const view = await ready();

		act(() => {
			view.result.current.setProgram("/p/target/debug/app");
			view.result.current.setArgs("");
			view.result.current.setCwd("/p");
			view.result.current.setEnv(leftover);
		});

		await act(async () => {
			await view.result.current.run();
		});

		expect(runBackend.starts).toEqual([
			{ program: "/p/target/debug/app", args: [], cwd: "/p", env: leftover },
		]);
	});
});
