/**
 * The command plumbing the Windows test-runner row shares.
 *
 * One bounded spawn helper, the failure text a report line carries, and the Visual Studio generator
 * search. The search is local to this probe on purpose: `scripts/cpp-parity*` is the compiler
 * probe's own seam and is not imported here, so a change there cannot move this row's meaning.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

/** Run one command in `cwd`, killed after `timeout`, with both streams captured. */
export function run(
	bin: string,
	args: string[],
	cwd: string,
	timeout = 120_000,
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (code: number | null, note = "") => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, stdout, stderr: stderr + note });
		};
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			finish(null, `\n[timed out after ${timeout}ms]\n`);
		}, timeout);
		child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
		child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
		child.on("error", (error) => finish(null, `\n[spawn error: ${error.message}]\n`));
		child.on("exit", (code) => finish(code));
	});
}

/** The first non-empty line, clipped: the one line a finding quotes for a failure. */
export function firstError(text: string): string {
	const line = text.split(/\r?\n/).find((candidate) => candidate.trim() !== "") ?? "";
	return line.trim().slice(0, 300);
}

/**
 * A failing command's own words, bounded.
 *
 * CMake wraps a cause over several lines — the generator rows once printed only the first two and
 * cut "could not find any instance of Visual Studio" off after the word "Generator" — so a finding
 * carries a few lines rather than one.
 */
export function errorLines(text: string, limit = 4): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.slice(0, limit)
		.map((line) => (line.length > 220 ? `${line.slice(0, 220)}…` : line));
}

/** The product's JSON answer: `{discovery}` / `{report}` on stdout, or `{error}` with exit 1. */
export function productAnswer<T>(
	result: RunResult,
	key: string,
): { value: T | null; error: string | null } {
	const line =
		result.stdout
			.split(/\r?\n/)
			.map((candidate) => candidate.trim())
			.find((candidate) => candidate.startsWith("{")) ?? "";
	if (line === "") {
		return {
			value: null,
			error: `printed no JSON (exit ${result.code}): ${firstError(result.stderr || result.stdout)}`,
		};
	}
	try {
		const answer = JSON.parse(line) as Record<string, unknown>;
		const error = typeof answer.error === "string" ? answer.error : null;
		const value = (answer[key] ?? null) as T | null;
		if (value === null && error === null) {
			return {
				value: null,
				error: `answered without "${key}": ${firstError(result.stdout)}`,
			};
		}
		return { value, error };
	} catch {
		return { value: null, error: `printed invalid JSON: ${firstError(line)}` };
	}
}

/** One line of `<tool> --version`, so a run records what it measured with. */
export async function versionLine(bin: string, cwd: string): Promise<string> {
	const result = await run(bin, ["--version"], cwd, 30_000);
	return result.code === 0 ? firstError(result.stdout) : `missing (${firstError(result.stderr)})`;
}

/** How a Visual Studio generator is spelled in `cmake --help`: `Visual Studio <version> <year>`. */
const VS_GENERATOR = /^\s*\*?\s*(Visual Studio (\d+) \d{4})\s*=/;

/**
 * Every Visual Studio generator `cmake --help` lists, newest first.
 *
 * The list is what this cmake supports, not what the image installed, so each one is still
 * configured before it is trusted; the version is never assumed, because `windows-latest` moves and
 * a hardcoded "Visual Studio 17 2022" failed on an image that lists a newer generator only.
 */
export function visualStudioGenerators(help: string): string[] {
	const found: { name: string; version: number }[] = [];
	for (const line of help.split(/\r?\n/)) {
		const match = VS_GENERATOR.exec(line);
		if (match === null || match[1] === undefined) continue;
		found.push({ name: match[1], version: Number(match[2] ?? 0) });
	}
	found.sort((one, other) => other.version - one.version);
	return found.map((entry) => entry.name);
}

const PROBE_MANIFEST = "cmake_minimum_required(VERSION 3.20)\nproject(quarry_runtime_probe CXX)\n";
const PROBE_SOURCE = "int main() { return 0; }\n";

export interface GeneratorSearch {
	generator: string | null;
	attempts: string[];
}

/** The newest generator this machine can actually configure with, with one line per attempt. */
export async function detectGenerator(cmake: string, scratch: string): Promise<GeneratorSearch> {
	const help = await run(cmake, ["--help"], scratch, 60_000);
	const attempts: string[] = [];
	for (const name of visualStudioGenerators(help.stdout)) {
		const root = join(scratch, name.replace(/[^A-Za-z0-9]+/g, "-"));
		mkdirSync(root, { recursive: true });
		writeFileSync(join(root, "CMakeLists.txt"), PROBE_MANIFEST);
		writeFileSync(join(root, "main.cpp"), PROBE_SOURCE);
		const result = await run(
			cmake,
			["-S", root, "-B", join(root, "build"), "-G", name, "-A", "x64"],
			root,
			180_000,
		);
		if (result.code === 0) {
			attempts.push(`${name}: configured for x64`);
			return { generator: name, attempts };
		}
		attempts.push(`${name}: ${errorLines(result.stderr)[0] ?? `exited ${result.code}`}`);
	}
	return { generator: null, attempts };
}
