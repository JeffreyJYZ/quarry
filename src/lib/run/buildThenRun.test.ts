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

	test("a build that reports no executable is reported instead of launching a stale binary", async () => {
		let resolvedCalls = 0;
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: true,
			build: async () => ({ success: true, summary: "build ok", artifact: null }),
			resolve: async () => {
				resolvedCalls += 1;
				return resolved;
			},
		});

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: NO_EXECUTABLE,
			diagnostics: [],
		});
		expect(resolvedCalls).toBe(0);
	});

	test("a blank artifact is no executable either", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({ success: true, summary: "build ok", artifact: "  " }),
			resolve: async () => resolved,
		});

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: NO_EXECUTABLE,
			diagnostics: [],
		});
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
			diagnostics: [],
		});
		expect(resolvedCalls).toBe(0);
	});

	test("a failed build keeps the compiler's own findings", async () => {
		const diagnostic = {
			path: "/work/demo/src/main.rs",
			range: {
				start: { line: 3, character: 4 },
				end: { line: 3, character: 9 },
			},
			severity: 1 as const,
			message: "cannot find value `foo` in this scope",
			source: "rustc",
		};
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({
				success: false,
				summary: "could not compile",
				diagnostics: [diagnostic],
			}),
			resolve: async () => resolved,
		});

		expect(result).toEqual({
			ok: false,
			stage: "build",
			message: "could not compile",
			diagnostics: [diagnostic],
		});
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
			diagnostics: [],
		});
	});

	test("a rejected resolve is reported as the resolve stage", async () => {
		const result = await buildThenResolve({
			root: "/work/demo",
			targetId: "cargo:demo:demo",
			profile: "debug",
			stopOnEntry: false,
			build: async () => ({
				success: true,
				summary: "build ok",
				artifact: "/work/demo/target/debug/demo",
			}),
			resolve: async () => {
				throw "unknown run target: cargo:demo:demo";
			},
		});

		expect(result).toEqual({
			ok: false,
			stage: "resolve",
			message: "unknown run target: cargo:demo:demo",
			diagnostics: [],
		});
	});
});
