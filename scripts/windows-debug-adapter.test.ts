#!/usr/bin/env bun
/**
 * Which adapter the row picks, why it rejects one, and what a startup death says.
 *
 * The first Windows run chose the first adapter on disk and reported `exit 53`; the second one threw
 * `EUNKNOWN` out of `uv_spawn` and ended the row. So these tests pin the two questions apart (found,
 * and starts), the product's own search order — library-bearing directories first — and a process
 * the OS refuses to create being a fact about one candidate rather than the end of the walk.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunOutcome } from "./windows-debug-toolchain";
import { probeAdapter } from "./windows-debug-adapter";
import { adapterCandidates, preferRunnable } from "./windows-debug-candidates";

import { describeExit } from "./windows-debug-exit";

/** A runner that answers one way for every command, so the probe's rule is the only variable. */
function runner(result: Partial<RunOutcome>): () => Promise<RunOutcome> {
	return async () => ({ code: 0, stdout: "", stderr: "", spawn: null, ...result });
}

/** A runner the OS refuses to create a process for, which is what `uv_spawn` does on Windows. */
const unspawnable = async () => {
	throw new Error("EUNKNOWN: unknown error, uv_spawn");
};

describe("the adapters a machine offers", () => {
	const environment = {
		PATH: "C:\\Windows;C:\\LLVM\\bin",
		ProgramFiles: "C:\\Program Files",
		USERPROFILE: "C:\\Users\\runner",
	};

	test("PATH comes first, then the tool directories, each named by its source", () => {
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

	test("a tool directory carrying liblldb.dll comes before one that does not", () => {
		// A real tree, because the Visual Studio bins are read off disk rather than composed.
		const root = mkdtempSync(join(tmpdir(), "quarry-program-files-"));
		const llvm = join(root, "LLVM", "bin");
		const studio = join(root, "Microsoft Visual Studio", "2026", "Community", "VC", "Tools");
		const vsBin = join(studio, "Llvm", "x64", "bin");
		mkdirSync(llvm, { recursive: true });
		mkdirSync(vsBin, { recursive: true });
		writeFileSync(join(llvm, "lldb-dap.exe"), "");
		writeFileSync(join(vsBin, "lldb-dap.exe"), "");
		writeFileSync(join(vsBin, "liblldb.dll"), "");

		const candidates = adapterCandidates({ PATH: "", ProgramFiles: root }, "win32");

		expect(candidates.map((candidate) => candidate.path)).toEqual([
			join(vsBin, "lldb-dap.exe"),
			join(llvm, "lldb-dap.exe"),
		]);
		expect(candidates.map((candidate) => candidate.loads)).toEqual([true, false]);
	});

	test("a directory without the loader is kept, only moved later", () => {
		const bare = { path: "C:\\bare" };
		const runnable = { path: "C:\\runnable" };
		const isFile = (path: string) => path === join("C:\\runnable", "liblldb.dll");
		expect(preferRunnable([bare, runnable], isFile)).toEqual([runnable, bare]);
	});

	test("an adapter with no .exe is not the one Windows runs", () => {
		const candidates = adapterCandidates(
			{ PATH: "C:\\LLVM\\bin" },
			"win32",
			(path) => path === join("C:\\LLVM\\bin", "lldb-dap"),
		);
		expect(candidates).toEqual([]);
	});
});

describe("whether an adapter starts", () => {
	const candidate = { path: "C:\\LLVM\\bin\\lldb-dap.exe", source: "PATH", loads: false };

	test("a process the OS refuses to create is a fact about the candidate, not an exception", async () => {
		const probe = await probeAdapter(candidate, unspawnable);
		expect(probe.runs).toBe(false);
		expect(probe.attempts.every((attempt) => attempt.spawn !== null)).toBe(true);
		expect(probe.attempts[0]?.spawn).toContain("uv_spawn");
	});

	test("both launch directories are tried before the candidate is called dead", async () => {
		const probe = await probeAdapter(candidate, runner({ code: 53 }));
		const directories = new Set(probe.attempts.map((attempt) => attempt.cwd));
		expect(directories).toContain(process.cwd());
		expect(directories).toContain(join("C:\\LLVM\\bin"));
	});

	test("a version banner is an answer, and nothing further is asked", async () => {
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

	test("a route that answers after the direct one failed is the route the session must use", async () => {
		// The image's shape: every direct spawn exits 53, and the same file answers through a shell.
		const run = async (
			_bin: string,
			_args: string[],
			_cwd: string,
			_timeout?: number,
			way = "direct",
		) =>
			way === "cmd"
				? { code: 0, stdout: "lldb-dap version 20.1.8", stderr: "", spawn: null }
				: { code: 53, stdout: "", stderr: "", spawn: null };

		const probe = await probeAdapter(candidate, run, ["direct", "cmd"]);

		expect(probe.runs).toBe(true);
		expect(probe.way).toBe("cmd");
		expect(probe.attempts.some((attempt) => attempt.way === "direct")).toBe(true);
	});

	test("every route is tried before a candidate is called dead", async () => {
		const probe = await probeAdapter(candidate, runner({ code: 53 }), [
			"direct",
			"cmd",
			"powershell",
		]);
		expect(new Set(probe.attempts.map((attempt) => attempt.way))).toEqual(
			new Set(["direct", "cmd", "powershell"]),
		);
		expect(probe.way).toBeNull();
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
});
