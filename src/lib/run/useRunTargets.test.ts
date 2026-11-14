import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

/**
 * The title-bar dropdown: detected targets, then the project's `.quarry/launch.json` presets.
 *
 * Without the presets a hand-set program has no row to select, so the Run button beside the
 * dropdown cannot be pointed at it at all.
 */

const backend = {
	presets: [] as { name: string; program: string | null }[],
	listFails: false,
};

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string) => {
		if (command === "list_run_targets") {
			if (backend.listFails) throw new Error("cargo is not installed");
			return [
				{
					id: "cargo:core:app",
					label: "app",
					kind: "cargo",
					package: "core",
					target: "app",
				},
			];
		}
		if (command === "read_launch_config") {
			return { configurations: backend.presets };
		}
		return undefined;
	},
}));

import { useRunTargets } from "@/lib/run/useRunTargets";

function mount() {
	return renderHook(() => useRunTargets("/p"));
}

afterEach(() => {
	cleanup();
	backend.presets = [];
	backend.listFails = false;
});

describe("the title-bar dropdown", () => {
	test("offers the project's presets after the detected targets", async () => {
		backend.presets = [{ name: "local", program: "/p/local" }];
		const { result } = mount();

		await waitFor(() =>
			expect(result.current.entries.map((entry) => entry.value)).toEqual([
				"cargo:core:app",
				"local",
			]),
		);
	});

	test("a selected preset stays selected when the list refreshes", async () => {
		backend.presets = [{ name: "local", program: "/p/local" }];
		const { result } = mount();
		await waitFor(() => expect(result.current.entries).toHaveLength(2));

		act(() => {
			result.current.setSelected("local");
		});
		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current.selected).toBe("local");
	});

	test("a failed target listing keeps the presets to select", async () => {
		backend.presets = [{ name: "local", program: "/p/local" }];
		backend.listFails = true;
		const { result } = mount();

		await waitFor(() => expect(result.current.error).not.toBeNull());
		expect(result.current.entries.map((entry) => entry.value)).toEqual(["local"]);
	});
});
