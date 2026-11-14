#!/usr/bin/env bun
/**
 * What a probe prints, and the one line a row that cannot measure anything ends on.
 *
 * The log is the only evidence a Windows runner leaves, so the report has to name the candidate, the
 * route, the directory, the status or spawn error, and what sat beside the binary — and, when nothing
 * starts at all, end on a skip that says so rather than a failure that can never go green.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { probeAdapter } from "./windows-debug-adapter";
import { causeLine, describeProbe, skipLine } from "./windows-debug-adapter-report";
import type { RunOutcome } from "./windows-debug-toolchain";

const candidate = { path: "C:\\LLVM\\bin\\lldb-dap.exe", source: "PATH", loads: true };

/** A runner the OS refuses to create a process for, which is what `uv_spawn` does on Windows. */
const unspawnable = async () => {
	throw new Error("EUNKNOWN: unknown error, uv_spawn");
};

/** A runner that exits with one status and says nothing, whichever route it is asked through. */
const silent = async (): Promise<RunOutcome> => ({
	code: 53,
	stdout: "",
	stderr: "",
	spawn: null,
});

describe("what a probe prints", () => {
	test("an unspawnable candidate says so, and says what sits beside it", async () => {
		const printed = describeProbe(await probeAdapter(candidate, unspawnable)).join("\n");
		expect(printed).toContain("dies");
		expect(printed).toContain("could not spawn");
		expect(printed).toContain("uv_spawn");
		expect(printed).toContain("beside it");
		expect(printed).toContain("folder");
	});

	test("a candidate that dies with a status prints the route, the directory and the status", async () => {
		const printed = describeProbe(await probeAdapter(candidate, silent)).join("\n");
		expect(printed).toContain("--version");
		expect(printed).toContain("direct cwd");
		expect(printed).toContain("cmd-shell cwd");
		expect(printed).toContain("53 (0x35)");
		expect(printed).toContain(join("C:\\LLVM\\bin"));
	});

	test("a candidate that answered says which route answered", async () => {
		const run = async (
			_bin: string,
			_args: string[],
			_cwd: string,
			_t?: number,
			way = "direct",
		) =>
			way === "cmd"
				? { code: 0, stdout: "lldb-dap version 20", stderr: "", spawn: null }
				: { code: 53, stdout: "", stderr: "", spawn: null };
		const printed = describeProbe(await probeAdapter(candidate, run, ["direct", "cmd"])).join(
			"\n",
		);
		expect(printed).toContain("starts (cmd-shell)");
	});
});

describe("the lines a failed walk ends on", () => {
	test("the cause line separates a refused process from one that died answering nothing", async () => {
		const refused = await probeAdapter(candidate, unspawnable);
		const dead = await probeAdapter(candidate, silent);
		expect(causeLine([refused, dead])).toContain("1 could not be created at all");
		expect(causeLine([refused, dead])).toContain("1 started and died");
	});

	test("the skip line names the candidates, their sources, the library and the statuses", async () => {
		const dead = await probeAdapter(candidate, silent, ["direct", "cmd"]);
		const refused = await probeAdapter(
			{ path: "C:\\VS\\lldb-dap.exe", source: "Visual Studio's LLVM", loads: false },
			unspawnable,
			["direct"],
		);

		const line = skipLine([dead, refused]);

		expect(line).toContain("2 lldb-dap candidate(s)");
		expect(line).toContain("PATH");
		expect(line).toContain("Visual Studio's LLVM");
		expect(line).toContain("1 with liblldb.dll beside it");
		expect(line).toContain("1 refused by the OS");
		expect(line).toContain("53 (0x35)");
	});

	test("a walk that only saw refusals says so instead of inventing a status", async () => {
		const refused = await probeAdapter(candidate, unspawnable);
		expect(skipLine([refused])).toContain("every route refused to create the process");
	});
});
