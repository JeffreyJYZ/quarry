import { describe, expect, test } from "bun:test";
import type { TestReport } from "@/lib/project/api";
import { runAllSummary, runAllTests } from "@/lib/tests/runAll";

function report(name: string, passed: boolean): TestReport {
	return { name, passed, output: "", durationMs: 1 };
}

describe("runAllTests", () => {
	test("walks in order and reports progress once per test", () => {
		const seen: string[] = [];
		const progress: string[] = [];
		return runAllTests({
			names: ["a", "b"],
			runOne: async (name) => {
				seen.push(name);
				return report(name, true);
			},
			onProgress: (done, total) => progress.push(`${done}/${total}`),
			isCurrent: () => true,
		}).then((result) => {
			expect(seen).toEqual(["a", "b"]);
			expect(progress).toEqual(["1/2", "2/2"]);
			expect(result).toEqual({ passed: 2, failed: 0, stopped: null });
		});
	});

	test("stops at the first failure", () => {
		return runAllTests({
			names: ["a", "b", "c"],
			runOne: async (name) => report(name, name !== "b"),
			onProgress: () => undefined,
			isCurrent: () => true,
		}).then((result) => {
			expect(result).toEqual({ passed: 1, failed: 1, stopped: "b" });
		});
	});

	test("a test already running elsewhere counts as done but decides nothing", () => {
		return runAllTests({
			names: ["a", "b"],
			runOne: async (name) => (name === "a" ? null : report(name, true)),
			onProgress: () => undefined,
			isCurrent: () => true,
		}).then((result) => {
			expect(result).toEqual({ passed: 1, failed: 0, stopped: null });
		});
	});

	// The wrong case: the walk outlived the project it belonged to and kept writing progress.
	test("a retired run reports no further progress and returns null", () => {
		let current = true;
		const progress: string[] = [];
		return runAllTests({
			names: ["a", "b", "c"],
			runOne: async (name) => {
				if (name === "b") current = false;
				return report(name, true);
			},
			onProgress: (done, total) => progress.push(`${done}/${total}`),
			isCurrent: () => current,
		}).then((result) => {
			expect(result).toBeNull();
			expect(progress).toEqual(["1/3"]);
		});
	});
});

describe("runAllSummary", () => {
	test("names the count when every test passed", () => {
		expect(runAllSummary({ passed: 3, failed: 0, stopped: null })).toBe("3 of 3 passed");
	});

	test("names the test that stopped the run", () => {
		expect(runAllSummary({ passed: 1, failed: 1, stopped: "b" })).toBe(
			"1 of 2 passed, stopped at b",
		);
	});
});
