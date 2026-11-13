import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { runBackend } from "@/test/runBackend";

mock.module("@tauri-apps/api/core", () => ({ invoke: runBackend.invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen: runBackend.listen }));

import type { LaunchConfig } from "@/lib/project/api";
import { useRunControls } from "@/ui/app/useRunControls";

type View = ReturnType<typeof setup>;

const target: LaunchConfig = {
	program: "/p/target/debug/app",
	args: [],
	cwd: "/p",
	stopOnEntry: false,
	initCommands: [],
};

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

/** Mounted and past the form's own restore, so a test only moves the fields it cares about. */
async function ready(): Promise<View> {
	const view = setup();
	await waitFor(() => expect(runBackend.sinks["run://output"]?.length ?? 0).toBe(1));
	await act(async () => {});
	return view;
}

/** The console's text, which is the only thing the dock renders. */
function text(view: View): string[] {
	return view.result.current.lines.map((line) => line.line);
}

async function runForm(view: View, program: string) {
	act(() => {
		view.result.current.setProgram(program);
		view.result.current.setArgs("");
		view.result.current.setCwd("/p");
		view.result.current.setEnv([]);
	});
	await act(async () => {
		await view.result.current.run();
	});
}

afterEach(() => {
	cleanup();
	runBackend.reset();
});

describe("a run attempt owns the console", () => {
	test("a form run after a target run shows only the form run", async () => {
		const view = await ready();

		await act(async () => {
			await view.result.current.runConfig(target);
		});
		act(() => runBackend.output("run-1", "target run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["target run"]));

		await runForm(view, "/bin/other");
		act(() => runBackend.output("run-2", "form run"));

		await waitFor(() => expect(text(view)).toEqual(["form run"]));
	});

	test("a target run after a form run shows only the target run", async () => {
		const view = await ready();

		await runForm(view, "/bin/first");
		act(() => runBackend.output("run-1", "form run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["form run"]));

		await act(async () => {
			await view.result.current.runConfig(target);
		});
		act(() => runBackend.output("run-2", "target run"));

		await waitFor(() => expect(text(view)).toEqual(["target run"]));
	});

	test("a failed build replaces the previous run's console", async () => {
		const view = await ready();

		await runForm(view, "/bin/first");
		act(() => runBackend.output("run-1", "first run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["first run"]));

		act(() => view.result.current.appendLog(["build failed: 1 error"]));

		await waitFor(() => expect(text(view)).toEqual(["build failed: 1 error"]));
		expect(view.result.current.exited).toBeNull();
	});

	test("a live run keeps its log when a second start is refused", async () => {
		const view = await ready();

		await runForm(view, "/bin/first");
		act(() => runBackend.output("run-1", "live line"));
		await waitFor(() => expect(text(view)).toEqual(["live line"]));

		await act(async () => {
			await view.result.current.runConfig(target);
		});
		act(() => runBackend.output("run-1", "live line 2", 2));

		await waitFor(() => expect(text(view)).toEqual(["live line", "live line 2"]));
		expect(runBackend.ids).toEqual(["run-1"]);
	});
});
