import { describe, expect, test } from "bun:test";
import type { LaunchConfig } from "@/lib/project/api";
import { buildThenResolve } from "@/lib/run/buildThenRun";

const resolved: LaunchConfig = {
	program: "/work/demo/target/debug/demo",
	args: [],
	cwd: "/work/demo",
	stopOnEntry: false,
	initCommands: [],
};

const dashed: LaunchConfig = { ...resolved, args: ["--flag"] };

describe("buildThenResolve", () => {
	test("a build artifact overrides the resolved program and keeps the rest", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "release",
			stopOnEntry: false,
			build: async () => ({
				success: true,
				summary: "build ok",
				artifact: "/work/demo/target/release/demo",
			}),
			resolve: async () => dashed,
		});

		expect(result).toEqual({
			ok: true,
			config: { ...dashed, program: "/work/demo/target/release/demo" },
		});
	});

	test("a debug build with no artifact keeps the resolved program", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: true,
			build: async () => ({ success: true, summary: "build ok", artifact: null }),
			resolve: async () => resolved,
		});

		expect(result).toEqual({ ok: true, config: resolved });
	});

	test("a blank artifact is no artifact", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({ success: true, summary: "build ok", artifact: "  " }),
			resolve: async () => resolved,
		});

		expect(result).toEqual({ ok: true, config: resolved });
	});

	test("a failed build reports its summary and never resolves", async () => {
		let resolvedCalls = 0;
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({ success: false, summary: "error[E0308]: mismatched types" }),
			resolve: async () => {
				resolvedCalls += 1;
				return resolved;
			},
		});

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: "error[E0308]: mismatched types",
		});
		expect(resolvedCalls).toBe(0);
	});

	test("a rejected build is a build failure, not an exception", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => {
				throw new Error("cargo is not installed");
			},
			resolve: async () => resolved,
		});

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: "cargo is not installed",
		});
	});

	test("a rejected resolve is reported as the resolve stage", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({ success: true, summary: "build ok" }),
			resolve: async () => {
				throw "unknown run target: cargo:demo:demo";
			},
		});

		expect(result).toEqual({
			ok: false,
			stage: "resolve",
			message: "unknown run target: cargo:demo:demo",
		});
	});
});
