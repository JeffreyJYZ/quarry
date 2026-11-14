#!/usr/bin/env bun
/**
 * What the debugger row takes from a machine instead of discovering on it.
 *
 * The row runs on two kinds of machine now: the Windows image, where the generator and the adapter
 * are discovered, and a developer's, where two environment variables name them. What those variables
 * mean, and how little they change, is measured here — the sequence after them is the same file.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunOutcome } from "./windows-debug-toolchain";
import {
	ADAPTER_VARIABLE,
	adapterList,
	configureArgs,
	GENERATOR_VARIABLE,
	isVisualStudio,
	localHint,
	namedAdapter,
	namedGenerator,
	toolchainAdapter,
} from "./windows-debug-local";

/** A runner that answers `xcrun --find lldb-dap` and counts how often it was asked. */
function answering(path: string): {
	run: (bin: string, args: string[], cwd: string) => Promise<RunOutcome>;
	calls: string[];
} {
	const calls: string[] = [];
	return {
		calls,
		run: async (bin, args) => {
			calls.push([bin, ...args].join(" "));
			return { code: 0, stdout: `${path}\n`, stderr: "", spawn: null };
		},
	};
}

describe("the generator the environment names", () => {
	test("a name is used as given, and an empty or unset one is no name at all", () => {
		expect(namedGenerator({ [GENERATOR_VARIABLE]: "Ninja Multi-Config" })).toBe(
			"Ninja Multi-Config",
		);
		expect(namedGenerator({ [GENERATOR_VARIABLE]: "  Xcode  " })).toBe("Xcode");
		expect(namedGenerator({ [GENERATOR_VARIABLE]: "   " })).toBeNull();
		expect(namedGenerator({})).toBeNull();
	});

	test("only a Visual Studio generator is told a platform architecture", () => {
		expect(isVisualStudio("Visual Studio 18 2026")).toBe(true);
		expect(isVisualStudio("Xcode")).toBe(false);
		expect(isVisualStudio("Ninja Multi-Config")).toBe(false);

		const studio = configureArgs("/project", "/project/build", "Visual Studio 18 2026");
		expect(studio).toEqual([
			"-S",
			"/project",
			"-B",
			"/project/build",
			"-G",
			"Visual Studio 18 2026",
			"-A",
			"x64",
		]);
		for (const generator of ["Xcode", "Ninja Multi-Config"]) {
			const args = configureArgs("/project", "/project/build", generator);
			expect(args).toEqual(["-S", "/project", "-B", "/project/build", "-G", generator]);
		}
	});
});

describe("the adapter the environment names", () => {
	test("a named path is kept, and says whether the library it loads sits beside it", () => {
		const directory = mkdtempSync(join(tmpdir(), "quarry-adapter-"));
		writeFileSync(join(directory, "lldb-dap"), "");
		const plain = namedAdapter({ [ADAPTER_VARIABLE]: join(directory, "lldb-dap") });
		expect(plain).toEqual({
			path: join(directory, "lldb-dap"),
			source: ADAPTER_VARIABLE,
			loads: false,
		});

		writeFileSync(join(directory, "liblldb.dll"), "");
		const loaded = namedAdapter({ [ADAPTER_VARIABLE]: join(directory, "lldb-dap") });
		expect(loaded?.loads).toBe(true);
	});

	test("an unset variable names nothing", () => {
		expect(namedAdapter({})).toBeNull();
		expect(namedAdapter({ [ADAPTER_VARIABLE]: "  " })).toBeNull();
	});
});

describe("the skip hint a non-Windows machine gets", () => {
	test("names both variables, and stays off where a Visual Studio generator exists", () => {
		expect(localHint("win32", null)).toBe("");
		expect(localHint("darwin", "Xcode")).toBe("");
		const hint = localHint("darwin", null);
		expect(hint).toContain(GENERATOR_VARIABLE);
		expect(hint).toContain(ADAPTER_VARIABLE);
	});
});

describe("the adapters one run may start", () => {
	test("a named adapter is the whole list, so a wrong path is reported as itself", async () => {
		const { run, calls } = answering("/somewhere/else/lldb-dap");
		const list = await adapterList(
			run,
			{ [ADAPTER_VARIABLE]: "/opt/lldb/bin/lldb-dap", PATH: "/usr/bin" },
			"darwin",
		);
		expect(list.map((entry) => entry.path)).toEqual(["/opt/lldb/bin/lldb-dap"]);
		expect(list[0]?.source).toBe(ADAPTER_VARIABLE);
		expect(calls).toEqual([]);
	});

	test("macOS answers from its toolchain where PATH cannot", async () => {
		const { run, calls } = answering("/Applications/Xcode.app/usr/bin/lldb-dap");
		const list = await adapterList(run, { PATH: "" }, "darwin");
		expect(list).toEqual([
			{
				path: "/Applications/Xcode.app/usr/bin/lldb-dap",
				source: "xcrun --find lldb-dap",
				loads: false,
			},
		]);
		expect(calls).toEqual(["/usr/bin/xcrun --find lldb-dap"]);
	});

	test("another platform has no toolchain answer, so an empty PATH stays empty", async () => {
		const { run, calls } = answering("/usr/bin/lldb-dap");
		expect(await adapterList(run, { PATH: "" }, "linux")).toEqual([]);
		expect(calls).toEqual([]);
	});
});

describe("the toolchain lookup itself", () => {
	test("a missing xcrun result is no adapter rather than an error", async () => {
		const run = async (): Promise<RunOutcome> => ({
			code: 1,
			stdout: "",
			stderr: "xcrun: error",
			spawn: null,
		});
		expect(await toolchainAdapter(run, "darwin")).toBeNull();
	});

	test("a platform without xcrun is never asked", async () => {
		let asked = 0;
		const run = async (): Promise<RunOutcome> => {
			asked += 1;
			return { code: 0, stdout: "/x/lldb-dap", stderr: "", spawn: null };
		};
		expect(await toolchainAdapter(run, "win32")).toBeNull();
		expect(asked).toBe(0);
	});
});

describe("a directory an adapter was named from", () => {
	test("the library check reads that directory, not the process cwd", () => {
		const directory = mkdtempSync(join(tmpdir(), "quarry-named-"));
		mkdirSync(join(directory, "bin"), { recursive: true });
		writeFileSync(join(directory, "bin", "liblldb.dll"), "");
		writeFileSync(join(directory, "bin", "lldb-dap.exe"), "");
		const candidate = namedAdapter({
			[ADAPTER_VARIABLE]: join(directory, "bin", "lldb-dap.exe"),
		});
		expect(candidate?.loads).toBe(true);
	});
});
