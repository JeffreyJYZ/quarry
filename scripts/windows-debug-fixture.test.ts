#!/usr/bin/env bun
/**
 * What the Windows debugger row builds and how it reads the answers back.
 *
 * The line numbers the breakpoint and the step use come from the fixture's own text rather than from
 * a number written twice, the artefact is the path a multi-config generator writes, an evaluated
 * result is read the way lldb spells it, and a failure carries the exchange it was judged on.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionTrace } from "./windows-debug-dap-report";
import { Checks } from "./windows-debug-checks";
import { integerValue } from "./windows-debug-dap-session";
import {
	BREAKPOINT_NEEDLE,
	CONFIGURATION,
	exeSuffix,
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

	test("the suffix is the platform's own, so a local build has none", () => {
		expect(exeSuffix("win32")).toBe(".exe");
		expect(exeSuffix("darwin")).toBe("");
		expect(programPath("/project/build", "darwin")).toBe(
			join("/project/build", CONFIGURATION, "parity_windows_debug"),
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
	const trace = {
		log: [
			{ kind: "request", message: { seq: 3, type: "request", command: "evaluate" } },
			{ kind: "response", message: { seq: 3, request_seq: 3, success: true } },
		],
		errors: ["error: no debug info"],
		spawn: "lldb-dap.exe (cwd C:\\work)",
		exit: 53,
	} as unknown as SessionTrace;

	test("the exact exchange of the failed assertion, then the process and its words", () => {
		const checks = new Checks();
		checks.add("stopped frame is app/main.cpp:7", true, "", 0, 1);
		checks.add("evaluate total before the step reads 0", false, 'result "3"', 0, 2);
		expect(checks.hadFailure).toBe(true);
		const printed = checks.failures(trace).join("\n");

		expect(printed).toContain('--- evaluate total before the step reads 0 (result "3") ---');
		expect(printed).toContain('→ {"seq":3,"type":"request","command":"evaluate"}');
		expect(printed).toContain('← {"seq":3,"request_seq":3,"success":true}');
		expect(printed).toContain("--- spawn: lldb-dap.exe (cwd C:\\work) ---");
		expect(printed).toContain("--- exit: 53 (0x35) ---");
		expect(printed).toContain("error: no debug info");
	});

	test("a session that died before any exchange still says how it died", () => {
		const checks = new Checks();
		checks.add("the session reached every step", false, "initialize was never answered", 0, 0);
		const printed = checks.failures({ ...trace, log: [], errors: [] }).join("\n");
		expect(printed).toContain("the session reached every step");
		expect(printed).toContain("exit: 53 (0x35)");
		expect(printed).toContain("(empty)");
	});

	test("a passing row has nothing to print", () => {
		const checks = new Checks();
		checks.add("stopped frame is app/main.cpp:7", true, "", 0, 1);
		expect(checks.hadFailure).toBe(false);
		expect(checks.count).toBe(1);
		expect(checks.failures(trace)).toEqual([]);
	});

	test("an evidence note is printed without deciding the run", () => {
		const checks = new Checks();
		checks.note("the verbatim spelling the project tree carries", "the adapter refused it");
		expect(checks.count).toBe(0);
		expect(checks.hadFailure).toBe(false);
		expect(checks.failures(trace)).toEqual([]);
	});
});
