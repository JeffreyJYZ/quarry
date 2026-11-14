import { describe, expect, test } from "bun:test";
import type { LaunchConfig } from "@/lib/project/api";
import { buildThenResolve, NO_EXECUTABLE } from "@/lib/run/buildThenRun";

const resolved: LaunchConfig = {
	program: "/work/demo/target/debug/demo",
	args: [],
	cwd: "/work/demo",
	stopOnEntry: false,
	initCommands: [],
};

const manual: LaunchConfig = {
	program: "/work/demo/manual",
	args: ["--manual"],
	cwd: "/work/demo/sub",
	stopOnEntry: false,
	initCommands: [],
};

function options(artifact: string | null | undefined, exists = true) {
	return {
		root: "/work/demo",
		targetId: "cpp:alpha",
		profile: "debug" as const,
		stopOnEntry: false,
		build: async () => ({ success: true, summary: "build ok", artifact }),
		resolve: async () => resolved,
		fallback: { config: manual, exists: async () => exists },
	};
}

describe("buildThenResolve with a manual program fallback", () => {
	test("no artifact launches the run form's configuration", async () => {
		const result = await buildThenResolve(options(null));

		expect(result).toEqual({ ok: true, config: manual });
	});

	test("the build's artifact still wins over the manual program", async () => {
		const result = await buildThenResolve(options("/work/demo/out/alpha"));

		expect(result).toEqual({
			ok: true,
			config: { ...resolved, program: "/work/demo/out/alpha" },
		});
	});

	test("a manual program that is not a file is a clear failure, not a launch", async () => {
		const result = await buildThenResolve(options(null, false));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.stage).toBe("resolve");
		expect(result.message).toContain("run form");
		expect(result.message).toContain(manual.program);
		expect(result.diagnostics).toEqual([]);
	});

	test("no artifact and no manual program keeps the build result", async () => {
		const withoutFallback = { ...options(null), fallback: null };
		const result = await buildThenResolve(withoutFallback);

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: NO_EXECUTABLE,
			diagnostics: [],
		});
	});
});
