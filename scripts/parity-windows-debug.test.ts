#!/usr/bin/env bun
/**
 * What the Windows debugger row decides without a Windows machine.
 *
 * The row cannot run here, so the parts that decide *whether* it runs and *what* it calls a match are
 * measured directly: the skip reasons in the order the work happens, discovery of the `.exe` name
 * lldb-dap actually carries, the LLVM bins under a Visual Studio install, a Windows path matching a
 * Windows path, and the two line numbers the fixture's own text defines.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_TOOLSET, NO_VS } from "./cpp-parity-windows";
import type { DapClient } from "./windows-debug-dap-client";
import { Checks, integerValue } from "./windows-debug-dap-session";
import {
	BREAKPOINT_NEEDLE,
	CONFIGURATION,
	MAIN,
	STEP_NEEDLE,
	lineOf,
	programPath,
} from "./windows-debug-fixture";
import {
	NO_ADAPTER,
	NO_CMAKE,
	adapterNames,
	findAdapter,
	pathEntries,
	sameSource,
	skipReason,
	verbatimPath,
	visualStudioLlvmBins,
} from "./windows-debug-toolchain";

describe("the reason a machine cannot run the row", () => {
	const ready = {
		cmake: true,
		generators: ["Visual Studio 18 2026"],
		configured: "Visual Studio 18 2026",
		adapter: "C:\\LLVM\\bin\\lldb-dap.exe",
	};

	test("names cmake first, because nothing configures without it", () => {
		expect(skipReason({ ...ready, cmake: false })).toBe(NO_CMAKE);
	});

	test("a cmake that lists no Visual Studio generator is the compiler rows' own reason", () => {
		expect(skipReason({ ...ready, generators: [] })).toBe(NO_VS);
	});

	test("a listed generator that never configured means the toolset is missing", () => {
		expect(skipReason({ ...ready, configured: null })).toBe(NO_TOOLSET);
	});

	test("a machine with a toolset but no adapter still cannot debug", () => {
		expect(skipReason({ ...ready, adapter: null })).toBe(NO_ADAPTER);
	});

	test("a machine with all four runs, so nothing is skipped", () => {
		expect(skipReason(ready)).toBeNull();
	});
});

describe("finding the adapter the image installed", () => {
	test("the name carries .exe on Windows and no suffix anywhere else", () => {
		expect(adapterNames("win32")).toEqual(["lldb-dap.exe"]);
		expect(adapterNames("darwin")).toEqual(["lldb-dap"]);
	});

	test("a PATH entry holding lldb-dap.exe is a hit", () => {
		const environment = { PATH: "C:\\ignored;C:\\LLVM\\bin" };
		const found = findAdapter(
			environment,
			"win32",
			(path) => path === join("C:\\LLVM\\bin", "lldb-dap.exe"),
		);
		expect(found).toBe(join("C:\\LLVM\\bin", "lldb-dap.exe"));
	});

	test("a file named lldb-dap with no .exe is not the adapter Windows runs", () => {
		const environment = { PATH: "C:\\LLVM\\bin" };
		const isFile = (path: string) => path === join("C:\\LLVM\\bin", "lldb-dap");
		expect(findAdapter(environment, "win32", isFile)).toBeNull();
	});

	test("the PATH is split on the separator the platform uses", () => {
		expect(pathEntries({ PATH: "C:\\a;C:\\b" }, "win32")).toEqual(["C:\\a", "C:\\b"]);
		expect(pathEntries({ PATH: "/usr/bin:/bin" }, "darwin")).toEqual(["/usr/bin", "/bin"]);
	});
});

describe("the LLVM bins Visual Studio installs", () => {
	test("the year and edition are read from disk, never named", () => {
		const root = mkdtempSync(join(tmpdir(), "quarry-vs-"));
		const tools = join(
			root,
			"Microsoft Visual Studio",
			"2026",
			"Community",
			"VC",
			"Tools",
			"Llvm",
			"x64",
		);
		mkdirSync(join(tools, "bin"), { recursive: true });
		writeFileSync(join(tools, "bin", "lldb-dap.exe"), "");
		const bins = visualStudioLlvmBins(root);
		expect(bins).toEqual([
			join(
				root,
				"Microsoft Visual Studio",
				"2026",
				"Community",
				"VC",
				"Tools",
				"Llvm",
				"x64",
				"bin",
			),
		]);
	});

	test("a root with no Visual Studio has no bins instead of failing", () => {
		const root = mkdtempSync(join(tmpdir(), "quarry-no-vs-"));
		expect(visualStudioLlvmBins(root)).toEqual([]);
	});
});

describe("a Windows source path", () => {
	test("matches the same file however the adapter spells it", () => {
		expect(sameSource("C:\\work\\app\\main.cpp", "c:/work/app/main.cpp")).toBe(true);
	});

	test("matches through the verbatim prefix a canonicalised path carries", () => {
		expect(sameSource("\\\\?\\C:\\work\\app\\main.cpp", "C:\\work\\app\\main.cpp")).toBe(true);
	});

	test("does not match another file", () => {
		expect(sameSource("C:\\work\\app\\main.cpp", "C:\\work\\core\\value.cpp")).toBe(false);
	});
});

describe("the verbatim spelling Windows adds", () => {
	test("a drive path gains the prefix and keeps its separators", () => {
		expect(verbatimPath("C:\\work\\app\\main.cpp", "win32")).toBe(
			"\\\\?\\C:\\work\\app\\main.cpp",
		);
	});

	test("a network path is the UNC form, not a prefixed one", () => {
		expect(verbatimPath("\\\\server\\share\\main.cpp", "win32")).toBe(
			"\\\\?\\UNC\\server\\share\\main.cpp",
		);
	});

	test("a platform without the prefix answers null, so the row does not ask for one", () => {
		expect(verbatimPath("/work/app/main.cpp", "darwin")).toBeNull();
	});
});

describe("the fixture the row builds", () => {
	test("the breakpoint line and the step line come from the source's own text", () => {
		expect(lineOf(MAIN, BREAKPOINT_NEEDLE)).toBe(7);
		expect(lineOf(MAIN, STEP_NEEDLE)).toBe(8);
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
});
