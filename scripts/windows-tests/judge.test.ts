/**
 * The Windows test-runner row's decisions, measured without a Windows machine.
 *
 * The row itself only runs on `windows-latest`, so everything it decides lives in `judge.ts` and
 * is tested here: what a discovery answer must contain, what the 20 s kill looks like in the dock's
 * notes, and what a case run must carry. The generator parse is the same one the compiler probe
 * tests, kept here because this row must not depend on `scripts/cpp-parity*`.
 */

import { describe, expect, test } from "bun:test";
import type { Discovery, Report } from "./judge";
import { caseCarried, describeRun, findTest, onlyCaseRan, timeoutNote } from "./judge";
import { visualStudioGenerators } from "./tools";

const listed = (items: Discovery["items"], notes: string[] = []): Discovery => ({
	items,
	program: "C:\\fixture\\build\\Debug\\parity_gtest.exe",
	notes,
});

describe("the case a discovery answer must hold", () => {
	test("a gtest name is found with its suite", () => {
		const discovery = listed([
			{ name: "ParitySuite.HoldsValues", binary: "parity_gtest.exe", suite: "gtest" },
		]);
		expect(findTest(discovery, "ParitySuite.HoldsValues", "gtest")?.binary).toBe(
			"parity_gtest.exe",
		);
	});

	test("a name from another suite is not a hit", () => {
		const discovery = listed([
			{ name: "ParitySuite.HoldsValues", binary: "tests/parity.rs", suite: "cargo" },
		]);
		expect(findTest(discovery, "ParitySuite.HoldsValues", "gtest")).toBeNull();
	});

	test("a near miss is not a hit", () => {
		const discovery = listed([
			{ name: "ParitySuite.HoldsOtherValues", binary: "parity_gtest.exe", suite: "gtest" },
		]);
		expect(findTest(discovery, "ParitySuite.HoldsValues", "gtest")).toBeNull();
	});
});

describe("the 20 s discovery kill", () => {
	test("the dock's timeout note is the measurement", () => {
		const discovery = listed(
			[],
			["list GoogleTest tests timed out after 20 s: parity_gtest_hang.exe was killed"],
		);
		expect(timeoutNote(discovery, 20)).toContain("timed out after 20 s");
	});

	test("a different bound is not this row's kill", () => {
		const discovery = listed([], ["list GoogleTest tests timed out after 120 s: cargo"]);
		expect(timeoutNote(discovery, 20)).toBeNull();
	});

	test("an answer with no note never proves a kill", () => {
		expect(timeoutNote(listed([]), 20)).toBeNull();
	});
});

describe("what a case run must report", () => {
	const report = (passed: boolean, output: string): Report => ({
		name: "ParitySuite.HoldsValues",
		passed,
		output,
		durationMs: 12,
	});

	test("a passing run carries the body's own output", () => {
		expect(
			caseCarried(
				report(true, "[ RUN      ] ParitySuite.HoldsValues\nparity-case-output total=5"),
				"parity-case-output total=5",
			),
		).toBe(true);
	});

	test("a passing run that printed nothing to read is not a pass", () => {
		expect(caseCarried(report(true, ""), "parity-case-output total=5")).toBe(false);
	});

	test("a failing run is not a pass even when the output is there", () => {
		expect(
			caseCarried(report(false, "parity-case-output total=5"), "parity-case-output total=5"),
		).toBe(false);
	});

	test("the report line names the state and the output size", () => {
		expect(describeRun(report(false, "first\n\nsecond"))).toBe(
			"failed, 2 output line(s), 12ms",
		);
		expect(describeRun(null)).toBe("no report");
	});

	test("a one-case run that ran a sibling did not stay inside its case", () => {
		expect(onlyCaseRan(report(true, "parity-case-output total=5"), "parity-other-output")).toBe(
			true,
		);
		expect(
			onlyCaseRan(
				report(true, "parity-case-output total=5\nparity-other-output"),
				"parity-other-output",
			),
		).toBe(false);
		expect(onlyCaseRan(null, "parity-other-output")).toBe(false);
	});
});

describe("the Visual Studio generators this row can select", () => {
	test("read newest first, with the default marker stripped", () => {
		const help = `Generators
* Visual Studio 17 2022        = Generates Visual Studio 2022 project files.
  Visual Studio 18 2026        = Generates Visual Studio 2026 project files.
  Ninja                        = Generates build.ninja files.
`;
		expect(visualStudioGenerators(help)).toEqual([
			"Visual Studio 18 2026",
			"Visual Studio 17 2022",
		]);
	});

	test("a machine with no Visual Studio generator has none to select", () => {
		const help = `Generators
* Unix Makefiles               = Generates standard UNIX makefiles.
  Xcode                        = Generate Xcode project files.
`;
		expect(visualStudioGenerators(help)).toEqual([]);
	});
});
