#!/usr/bin/env bun
/**
 * What the Windows debugger row builds and how it reads the answers back.
 *
 * The line numbers the breakpoint and the step use come from the fixture's own text rather than from
 * a number written twice, the artefact is the path the Visual Studio generator writes, an evaluated
 * result is read the way lldb spells it, and a failure carries the exchange it was judged on.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DapClient } from "./windows-debug-dap-client";
import { Checks } from "./windows-debug-checks";
import { integerValue } from "./windows-debug-dap-session";
import {
	BREAKPOINT_NEEDLE,
	CONFIGURATION,
	FILES,
	MAIN,
	MAIN_SOURCE,
	STEP_NEEDLE,
	lineOf,
	programPath,
	writeFixture,
} from "./windows-debug-fixture";

describe("the fixture's writer", () => {
	/**
	 * The row's first Windows run died in this function: it wrote `app/main.cpp` relative to the
	 * process cwd, so the fixture landed beside the repository instead of inside it. A writer that
	 * takes a root must only ever write under it, and must create each file's directory itself.
	 */
	test("writes every file under the root it is given, and nothing in the cwd", () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "quarry-fixture-")));
		const before = readdirSync(process.cwd());

		const main = writeFixture(root);

		for (const file of FILES) {
			const path = join(root, file.relative);
			expect(existsSync(path)).toBe(true);
			expect(readFileSync(path, "utf8")).toBe(file.text);
		}
		expect(main).toBe(join(root, MAIN_SOURCE));

		const added = readdirSync(process.cwd()).filter((entry) => !before.includes(entry));
		expect(added).toEqual([]);
		expect(existsSync(join(process.cwd(), MAIN_SOURCE))).toBe(false);
	});

	test("one table names every file, so none of them can be left unrooted", () => {
		const relatives = FILES.map((file) => file.relative).sort();
		const expected = [
			"CMakeLists.txt",
			join("app", "main.cpp"),
			join("core", "value.cpp"),
			join("include", "value.h"),
		];
		expect(relatives).toEqual(expected.sort());
	});
});

describe("the fixture the row builds", () => {
	test("the breakpoint line and the step line come from the source's own text", () => {
		expect(lineOf(MAIN, BREAKPOINT_NEEDLE)).toBe(7);
		expect(lineOf(MAIN, STEP_NEEDLE)).toBe(8);
	});

	test("a needle the fixture does not contain is a defect here, not a wrong line", () => {
		expect(() => lineOf(MAIN, "no such statement")).toThrow(/no line contains/);
	});

	test("the artefact is the configuration directory the generator writes", () => {
		expect(programPath("C:\\project\\build", "win32")).toBe(
			join("C:\\project\\build", CONFIGURATION, "parity_windows_debug.exe"),
		);
	});
});

describe("reading an evaluated result", () => {
	test("a bare value, a repl-shaped value and a missing value", () => {
		expect(integerValue("0")).toBe(0);
		expect(integerValue("(int) $0 = 5")).toBe(5);
		expect(integerValue("<not available>")).toBeNull();
	});
});

describe("what a failing assertion prints", () => {
	const client = {
		report: (from: number, to: number) => [`→ request ${from}`, `← response ${to}`],
		stderrLines: () => ["error: no debug info"],
	} as unknown as DapClient;

	test("the exact exchange of the failed assertion, and the adapter's own words", () => {
		const checks = new Checks();
		checks.add("stopped frame is app/main.cpp:7", true, "", 0, 1);
		checks.add("evaluate total before the step reads 0", false, 'result "3"', 1, 2);
		expect(checks.hadFailure).toBe(true);
		expect(checks.failures(client)).toEqual([
			'--- evaluate total before the step reads 0 (result "3") ---',
			"→ request 1",
			"← response 2",
			"--- lldb-dap stderr ---",
			"error: no debug info",
		]);
	});

	test("a passing row has nothing to print", () => {
		const checks = new Checks();
		checks.add("stopped frame is app/main.cpp:7", true, "", 0, 1);
		expect(checks.hadFailure).toBe(false);
		expect(checks.count).toBe(1);
		expect(checks.failures(client)).toEqual([]);
	});

	test("an evidence note is printed without deciding the run", () => {
		const checks = new Checks();
		checks.note("the verbatim spelling the project tree carries", "the adapter refused it");
		expect(checks.count).toBe(0);
		expect(checks.hadFailure).toBe(false);
		expect(checks.failures(client)).toEqual([]);
	});
});
