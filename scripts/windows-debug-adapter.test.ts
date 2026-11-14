#!/usr/bin/env bun
/**
 * Which adapter the row picks, why it rejects one, and what a startup death says.
 *
 * The first Windows run chose the first adapter on disk and reported `exit 53` — the binary existed
 * and could not start, and neither fact was in the log. These tests pin the two questions apart
 * (found, and starts), the product's own search order, and the status decoding that names a loader
 * failure instead of printing a bare number.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { RunResult } from "./cpp-parity/types";
import {
	adapterCandidates,
	chooseAdapter,
	describeExit,
	describeProbe,
	probeAdapter,
} from "./windows-debug-adapter";

/** A runner that answers one way for every command, so the probe's rule is the only variable. */
function runner(
	result: Partial<RunResult>,
): (bin: string, args: string[], cwd: string) => Promise<RunResult> {
	return async () => ({ code: 0, stdout: "", stderr: "", ...result });
}

describe("the adapters a machine offers", () => {
	const environment = {
		PATH: "C:\\Windows;C:\\LLVM\\bin",
		ProgramFiles: "C:\\Program Files",
		USERPROFILE: "C:\\Users\\runner",
	};

	test("the order is the product resolver's: PATH, then Program Files, then Visual Studio", () => {
		const existing = new Set([
			join("C:\\LLVM\\bin", "lldb-dap.exe"),
			join("C:\\Program Files", "LLVM", "bin", "lldb-dap.exe"),
		]);
		const candidates = adapterCandidates(environment, "win32", (path) => existing.has(path));

		expect(candidates.map((candidate) => candidate.path)).toEqual([
			join("C:\\LLVM\\bin", "lldb-dap.exe"),
			join("C:\\Program Files", "LLVM", "bin", "lldb-dap.exe"),
		]);
		expect(candidates.map((candidate) => candidate.source)).toEqual([
			"PATH",
			"%ProgramFiles%\\LLVM\\bin",
		]);
	});

	test("an adapter with no .exe is not the one Windows runs", () => {
		const candidates = adapterCandidates(
			{ PATH: "C:\\LLVM\\bin" },
			"win32",
			(path) => path === join("C:\\LLVM\\bin", "lldb-dap"),
		);
		expect(candidates).toEqual([]);
	});

	test("a machine that is not Windows has no program-files roots to search", () => {
		expect(
			adapterCandidates({ PATH: "/usr/bin:/opt/llvm/bin" }, "darwin", () => false),
		).toEqual([]);
	});
});

describe("whether an adapter starts", () => {
	const candidate = { path: "C:\\LLVM\\bin\\lldb-dap.exe", source: "PATH" };

	test("an exit status with no output on either stream means it never ran", async () => {
		const probe = await probeAdapter(candidate, runner({ code: 53 }));
		expect(probe.runs).toBe(false);
		expect(probe.attempts).toHaveLength(2);
	});

	test("a version banner is an answer, and the second question is not asked", async () => {
		const probe = await probeAdapter(
			candidate,
			runner({ code: 0, stdout: "lldb-dap version 20" }),
		);
		expect(probe.runs).toBe(true);
		expect(probe.attempts).toHaveLength(1);
		expect(probe.attempts[0]?.args).toEqual(["--version"]);
	});

	test("a clean exit with no output still proves the process ran", async () => {
		expect((await probeAdapter(candidate, runner({ code: 0 }))).runs).toBe(true);
	});

	test("the first candidate that starts wins, and the rejected one is kept", async () => {
		const dead = { path: "C:\\dead\\lldb-dap.exe", source: "PATH" };
		const live = { path: "C:\\live\\lldb-dap.exe", source: "Visual Studio's LLVM" };
		let asked = 0;
		const run = async (bin: string) => {
			asked += 1;
			return { code: bin.includes("dead") ? 53 : 0, stdout: "", stderr: "" };
		};

		const { chosen, probes } = await chooseAdapter([dead, live], run);

		expect(chosen).toBe(live);
		expect(probes.map((probe) => probe.runs)).toEqual([false, true]);
		// Both questions to the dead copy, then one to the live one, which answers it.
		expect(asked).toBe(3);
	});

	test("no candidate that starts leaves nothing chosen", async () => {
		const { chosen, probes } = await chooseAdapter(
			[{ path: "C:\\a\\lldb-dap.exe", source: "PATH" }],
			runner({ code: 53 }),
		);
		expect(chosen).toBeNull();
		expect(probes).toHaveLength(1);
	});
});

describe("what an exit status says", () => {
	test("a bare 53 is a number and a hex word, with no cause invented", () => {
		expect(describeExit(53)).toBe("53 (0x35)");
	});

	test("a loader status names the DLL it could not load", () => {
		expect(describeExit(0xc0000135)).toContain("could not find a DLL");
	});

	test("a status that arrives as a negative i32 keeps its hex word", () => {
		expect(describeExit(0xc0000135 - 2 ** 32)).toContain("0xc0000135");
	});

	test("a process that has not ended has no status to print", () => {
		expect(describeExit(null)).toBe("no exit status");
	});
});

describe("a probe as log lines", () => {
	test("names the adapter, its source, both questions and what sits beside it", async () => {
		const probe = await probeAdapter(
			{ path: join("C:\\LLVM\\bin", "lldb-dap.exe"), source: "PATH" },
			runner({ code: 53 }),
		);
		const lines = describeProbe(probe).join("\n");
		expect(lines).toContain("dies");
		expect(lines).toContain("--version: 53 (0x35)");
		expect(lines).toContain("-h: 53 (0x35)");
		expect(lines).toContain("beside it:");
	});
});
