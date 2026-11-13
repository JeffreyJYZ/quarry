import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { runBackend } from "@/test/runBackend";

mock.module("@tauri-apps/api/core", () => ({ invoke: runBackend.invoke }));
mock.module("@tauri-apps/api/event", () => ({ listen: runBackend.listen }));

import { useRunProcess } from "@/lib/run/useRunProcess";

function setup() {
	return renderHook(() => useRunProcess(() => {}));
}

/** The console's text, which is the only thing the dock renders. */
function text(view: ReturnType<typeof setup>): string[] {
	return view.result.current.lines.map((line) => line.line);
}

async function ready(view: ReturnType<typeof setup>) {
	await waitFor(() => expect(runBackend.sinks["run://output"]?.length ?? 0).toBe(1));
	return view;
}

afterEach(() => {
	cleanup();
	runBackend.reset();
});

describe("one console per run", () => {
	test("a second run's console holds only the second run's lines", async () => {
		const view = await ready(setup());

		await act(async () => {
			await view.result.current.start("/bin/first", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "first run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["first run"]));

		await act(async () => {
			await view.result.current.start("/bin/second", [], "/p", []);
		});
		act(() => runBackend.output("run-2", "second run"));

		await waitFor(() => expect(text(view)).toEqual(["second run"]));
	});

	test("a failed build attempt replaces the previous run's lines", async () => {
		const view = await ready(setup());

		await act(async () => {
			await view.result.current.start("/bin/first", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "first run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["first run"]));

		act(() => view.result.current.append(["build failed"]));

		await waitFor(() => expect(text(view)).toEqual(["build failed"]));
	});

	test("a run after a failed build starts clean", async () => {
		const view = await ready(setup());

		act(() => view.result.current.append(["build failed"]));
		await waitFor(() => expect(text(view)).toEqual(["build failed"]));

		await act(async () => {
			await view.result.current.start("/bin/second", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "second run"));

		await waitFor(() => expect(text(view)).toEqual(["second run"]));
	});

	test("a stale run's late output never lands in the new run's console", async () => {
		const view = await ready(setup());

		await act(async () => {
			await view.result.current.start("/bin/first", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "first run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(text(view)).toEqual(["first run"]));

		let release = () => {};
		runBackend.gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let done: Promise<boolean> | null = null;
		act(() => {
			done = view.result.current.start("/bin/second", [], "/p", []);
		});
		// Both arrive while the start command is still in flight: the old run's tail must be
		// dropped, and the new run's first line kept.
		act(() => runBackend.output("run-1", "stale line", 2));
		act(() => runBackend.output("run-2", "early line"));
		runBackend.gate = null;
		release();
		await act(async () => {
			await done;
		});

		await waitFor(() => expect(text(view)).toEqual(["early line"]));
	});

	test("a refused second start leaves the live log intact", async () => {
		const view = await ready(setup());

		await act(async () => {
			await view.result.current.start("/bin/first", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "live line"));
		await waitFor(() => expect(text(view)).toEqual(["live line"]));

		await act(async () => {
			await view.result.current.start("/bin/second", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "live line 2", 2));

		await waitFor(() => expect(text(view)).toEqual(["live line", "live line 2"]));
		expect(runBackend.ids).toEqual(["run-1"]);
	});

	test("an explicit clear empties the console", async () => {
		const view = await ready(setup());

		await act(async () => {
			await view.result.current.start("/bin/first", [], "/p", []);
		});
		act(() => runBackend.output("run-1", "first run"));
		act(() => runBackend.exit("run-1"));
		await waitFor(() => expect(view.result.current.lines.length).toBe(1));

		act(() => view.result.current.clear());

		await waitFor(() => expect(view.result.current.lines).toEqual([]));
		expect(view.result.current.exited).toBeNull();
	});
});
