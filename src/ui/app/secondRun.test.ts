import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

/**
 * The second-run path at the seam both title-bar buttons share.
 *
 * A build that reports no executable used to end the launch even when the Run form held a program
 * the user had set by hand. The fallback is now explicit, and the build's own artifact still wins.
 */

type Report = {
	success: boolean;
	diagnostics: unknown[];
	durationMs: number;
	summary: string;
	artifact?: string | null;
};

const backend = {
	report: null as Report | null,
	exists: true,
	resolved: 0,
	presets: 0,
	builds: 0,
	buildTargets: [] as (string | null)[],
};

mock.module("@tauri-apps/api/core", () => ({
	invoke: async (command: string, args?: Record<string, unknown>) => {
		if (command === "build_project") {
			backend.builds += 1;
			backend.buildTargets.push((args?.target as string | null | undefined) ?? null);
			return backend.report;
		}
		if (command === "program_exists") return backend.exists;
		if (command === "resolve_run_target") {
			backend.resolved += 1;
			return {
				program: "/p/build/alpha",
				args: [],
				cwd: "/p",
				stopOnEntry: false,
				initCommands: [],
			};
		}
		if (command === "resolve_launch_config") {
			backend.presets += 1;
			return {
				program: "/p/from-preset",
				args: [],
				cwd: "/p",
				stopOnEntry: false,
				initCommands: [],
			};
		}
		return undefined;
	},
}));
mock.module("@tauri-apps/api/event", () => ({
	listen: async () => () => undefined,
}));

import type { LaunchConfig } from "@/lib/project/api";
import { resetBuildGate } from "@/lib/project/buildOnce";
import { useRunLauncher } from "@/lib/run/useRunLauncher";

const emptyBuild: Report = {
	success: true,
	diagnostics: [],
	durationMs: 12,
	summary: "ninja: no work to do.",
	artifact: null,
};

function launch(program: string, isPreset = false) {
	const started: LaunchConfig[] = [];
	const failures: string[] = [];
	const view = renderHook(() =>
		useRunLauncher({
			root: "/p",
			profile: "debug",
			targetId: isPreset ? "local" : "cpp:alpha",
			isPreset,
			runForm: { program, args: "--manual", cwd: "/p" },
			onRun: (config: LaunchConfig) => started.push(config),
			onDebug: (config: LaunchConfig) => started.push(config),
			onFailure: (failure) => failures.push(`${failure.stage}: ${failure.message}`),
		}),
	);
	return { view, started, failures };
}

afterEach(() => {
	cleanup();
	resetBuildGate();
	backend.report = null;
	backend.exists = true;
	backend.resolved = 0;
	backend.presets = 0;
	backend.builds = 0;
	backend.buildTargets = [];
});

describe("the title-bar Run and a program set in the run form", () => {
	test("launches the form's program when the build names no executable", async () => {
		backend.report = emptyBuild;
		const { view, started, failures } = launch("/p/custom");

		await act(async () => {
			await view.result.current.run();
		});

		expect(failures).toEqual([]);
		expect(started.map((config) => config.program)).toEqual(["/p/custom"]);
		expect(started[0]?.args).toEqual(["--manual"]);
		expect(backend.resolved).toBe(0);
	});

	test("Debug takes the same fallback, so one fix covers both buttons", async () => {
		backend.report = emptyBuild;
		const { view, started, failures } = launch("/p/custom");

		await act(async () => {
			await view.result.current.debug();
		});

		expect(failures).toEqual([]);
		expect(started.map((config) => config.program)).toEqual(["/p/custom"]);
	});

	test("the build's artifact still wins over the form's program", async () => {
		backend.report = { ...emptyBuild, artifact: "/p/out/debug/alpha" };
		const { view, started, failures } = launch("/p/custom");

		await act(async () => {
			await view.result.current.run();
		});

		expect(failures).toEqual([]);
		expect(started.map((config) => config.program)).toEqual(["/p/out/debug/alpha"]);
		expect(backend.resolved).toBe(1);
	});

	test("a form program that is not a file is reported instead of launched", async () => {
		backend.report = emptyBuild;
		backend.exists = false;
		const { view, started, failures } = launch("/p/gone");

		await act(async () => {
			await view.result.current.run();
		});

		expect(started).toEqual([]);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain("resolve:");
		expect(failures[0]).toContain("run form");
		expect(failures[0]).toContain("/p/gone");
	});

	test("a preset selected in the dropdown resolves through launch.json", async () => {
		backend.report = emptyBuild;
		const { view, started, failures } = launch("", true);

		await act(async () => {
			await view.result.current.run();
		});

		expect(failures).toEqual([]);
		expect(started.map((config) => config.program)).toEqual(["/p/from-preset"]);
		expect(backend.presets).toBe(1);
		expect(backend.resolved).toBe(0);
		expect(backend.buildTargets).toEqual([null]);
	});
});
