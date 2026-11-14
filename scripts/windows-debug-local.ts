#!/usr/bin/env bun
/**
 * The machine the debugger row runs on, when that machine is not the Windows image.
 *
 * The row was written for `windows-latest`: a Visual Studio generator found through `cmake --help`,
 * and `lldb-dap` found where Windows installs LLVM. Neither holds on a development machine, where
 * CMake offers `Xcode` and `Ninja Multi-Config` and macOS ships `lldb-dap` inside Xcode rather than
 * on `PATH`. Two environment variables name those facts so the same sequence can be measured here.
 *
 * Nothing else changes with them: the fixture, the breakpoint, the two `evaluate`s, the step and the
 * continue are the product's requests on either machine, and the assertions that judge them are the
 * same file. Only the two machine facts — which generator, which adapter — are supplied instead of
 * discovered.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { adapterCandidates, directoryOf, type Candidate } from "./windows-debug-candidates";
import { ADAPTER_LIBRARY } from "./windows-debug-exit";
import type { RunOutcome } from "./windows-debug-toolchain";

/** The variable naming the CMake generator to configure with instead of discovering one. */
export const GENERATOR_VARIABLE = "PARITY_DEBUG_GENERATOR";

/** The variable naming the adapter to run instead of finding one. */
export const ADAPTER_VARIABLE = "PARITY_DEBUG_ADAPTER";

/** The generator the environment names, or null when it names none. */
export function namedGenerator(
	environment: Record<string, string | undefined> = process.env,
): string | null {
	const value = (environment[GENERATOR_VARIABLE] ?? "").trim();
	return value === "" ? null : value;
}

/** The adapter the environment names, or null when it names none. */
export function namedAdapter(
	environment: Record<string, string | undefined> = process.env,
	isFile: (path: string) => boolean = existsSync,
): Candidate | null {
	const path = (environment[ADAPTER_VARIABLE] ?? "").trim();
	if (path === "") return null;
	return {
		path,
		source: ADAPTER_VARIABLE,
		loads: isFile(join(directoryOf(path), ADAPTER_LIBRARY)),
	};
}

/**
 * Whether a generator is one of Visual Studio's.
 *
 * The distinction is only the platform argument: `-A x64` is how a Visual Studio generator is told
 * which toolset architecture to build, and every other generator rejects it outright.
 */
export function isVisualStudio(generator: string): boolean {
	return /^Visual Studio /.test(generator);
}

/** The configure argv for a generator: the platform argument only where it means something. */
export function configureArgs(source: string, build: string, generator: string): string[] {
	const base = ["-S", source, "-B", build, "-G", generator];
	return isVisualStudio(generator) ? [...base, "-A", "x64"] : base;
}

/** How a program is run: the row's own runner, narrowed to what a lookup needs. */
type Runner = (bin: string, args: string[], cwd: string) => Promise<RunOutcome>;

/**
 * The adapter the platform's toolchain answers with, asked only where `PATH` cannot have it.
 *
 * macOS installs `lldb-dap` inside Xcode's toolchain and never links it onto `PATH`, so a row that
 * only read `PATH` would skip a machine that can measure every assertion. `xcrun --find` is the
 * platform's own answer to "where is the tool", and the row prints it as the adapter's source.
 */
export async function toolchainAdapter(
	run: Runner,
	platform: string = process.platform,
): Promise<Candidate | null> {
	if (platform !== "darwin") return null;
	const found = await run("/usr/bin/xcrun", ["--find", "lldb-dap"], process.cwd());
	const path = found.code === 0 ? found.stdout.trim() : "";
	if (path === "") return null;
	return { path, source: "xcrun --find lldb-dap", loads: false };
}

/** The clause that names the local-mode variables on a machine with no Visual Studio generator. */
export function localHint(platform: string, named: string | null): string {
	if (platform === "win32" || named !== null) return "";
	return ` — on ${platform}, set ${GENERATOR_VARIABLE} and, if PATH has no lldb-dap, ${ADAPTER_VARIABLE} to measure the same sequence locally`;
}

/**
 * Every adapter this run may start, in the order it will try them.
 *
 * An explicitly named adapter is the whole list, so a wrong path is reported as that path rather
 * than silently replaced by a discovered one. Otherwise the product resolver's own order decides —
 * `PATH` first, then the directories Windows installs into — and the platform toolchain answers last.
 */
export async function adapterList(
	run: Runner,
	environment: Record<string, string | undefined> = process.env,
	platform: string = process.platform,
): Promise<Candidate[]> {
	const named = namedAdapter(environment);
	if (named !== null) return [named];
	const discovered = adapterCandidates(environment, platform);
	if (discovered.length > 0) return discovered;
	const located = await toolchainAdapter(run, platform);
	return located === null ? [] : [located];
}
