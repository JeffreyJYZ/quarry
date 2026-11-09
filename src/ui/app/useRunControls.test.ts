import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { EnvVar, LaunchConfig } from "@/lib/project/api";

/** Every start the hook made, in order, with the environment rows it handed the process. */
const starts: { program: string; env: EnvVar[] }[] = [];

mock.module("@/lib/run/useRunProcess", () => ({
	useRunProcess: () => ({
		running: null,
		stopping: false,
		lines: [],
		exited: null,
		start: async (
			program: string,
			_args: string[],
			_cwd: string,
			env: EnvVar[],
		): Promise<boolean> => {
			starts.push({ program, env });
			return true;
		},
		stop: async () => {},
		clear: () => {},
		sendStdin: async () => {},
		append: () => {},
	}),
}));

mock.module("@/ui/app/useRunFormMemory", () => ({ useRunFormMemory: () => undefined }));

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

afterEach(() => {
	cleanup();
	starts.length = 0;
});

describe("a run's environment rows", () => {
	test("a detected target passes none of the rows a saved configuration left in the form", async () => {
		const { result } = setup();

		act(() => {
			result.current.setProgram("/p/target/debug/other");
			result.current.setArgs("");
			result.current.setCwd("/p");
			result.current.setEnv(leftover);
		});

		await act(async () => {
			await result.current.runConfig(target);
		});

		expect(starts).toEqual([{ program: target.program, env: [] }]);
	});

	test("a saved configuration still passes its own rows", async () => {
		const { result } = setup();

		act(() => {
			result.current.setProgram("/p/target/debug/app");
			result.current.setArgs("");
			result.current.setCwd("/p");
			result.current.setEnv(leftover);
		});

		await act(async () => {
			await result.current.run();
		});

		expect(starts).toEqual([{ program: "/p/target/debug/app", env: leftover }]);
	});
});
