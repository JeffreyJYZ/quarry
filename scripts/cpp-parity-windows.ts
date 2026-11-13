#!/usr/bin/env bun
/**
 * The Windows rows: MSVC through the Visual Studio generator.
 *
 * A CLion user on Windows does not build with clang. Their profile is the Visual Studio generator,
 * `cl.exe` compiles, and the generator writes no `compile_commands.json` at all — so the database
 * clangd reads is the one quarry synthesises from CMake's file API, and every flag in it has to be
 * spelled the way MSVC's driver takes it.
 *
 * Two rows share one project shape: a library plus an app that includes its header, and a define
 * that differs per configuration so a build's own output says which configuration reached the
 * compiler. The rows differ in what they judge — the generator and its database, or the compiler
 * inside that database — and in `cpp-parity-vs-row.ts`.
 *
 * Nothing here runs on macOS: the generator does not exist there, and a row that cannot run must say
 * so by name rather than pass quietly.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fixture } from "./cpp-parity-fixtures";
import type { Measurement, Plan, RunResult } from "./cpp-parity-probe";

/** The tree the fixture's own build writes, which is CLion's shape on Windows. */
export const VS_BUILD_DIR = "build";

/** The executable the project defines; the artefact a plan must name is `<build>/<Config>/this`. */
export const VS_TARGET = "parity_vs";

/** The file the build writes for that target, named the way a link on Windows names it. */
export const VS_EXE = `${VS_TARGET}.exe`;

/**
 * Why a machine without a Visual Studio generator skips both rows, in words that name the fix.
 *
 * The version is deliberately absent: `windows-latest` images move, and a hardcoded "Visual Studio
 * 17 2022" failed on one that lists only a newer generator. Which one exists is discovered.
 */
export const NO_VS =
	"cmake lists no Visual Studio generator (install Visual Studio with the C++ workload)";

/** Why a machine whose Visual Studio generators all failed to configure skips both rows. */
export const NO_TOOLSET =
	"every Visual Studio generator cmake lists failed to configure: the C++ toolset is not installed";

/** How a Visual Studio generator is spelled in `cmake --help`: `Visual Studio <version> <year>`. */
const VS_GENERATOR_LINE = /^\s*\*?\s*(Visual Studio (\d+) \d{4})\s*=/;

/**
 * Every Visual Studio generator `cmake --help` lists, newest first.
 *
 * The list is what this cmake *supports*, not what the machine has installed, so each one is still
 * tried before it is trusted: an image can list a generator whose instance is absent.
 */
export function vsGenerators(help: string): string[] {
	const found: { name: string; version: number }[] = [];
	for (const line of help.split(/\r?\n/)) {
		const match = VS_GENERATOR_LINE.exec(line);
		if (match === null || match[1] === undefined) continue;
		found.push({ name: match[1], version: Number(match[2] ?? 0) });
	}
	found.sort((one, other) => other.version - one.version);
	return found.map((entry) => entry.name);
}

/** What a generator search found, and one line per candidate saying how it answered. */
export interface VsDetection {
	generator: string | null;
	attempts: string[];
}

/** The project each candidate generator is asked to configure, small enough to cost one second. */
const DETECT_MANIFEST = "cmake_minimum_required(VERSION 3.20)\nproject(quarry_vs_probe CXX)\n";
const DETECT_SOURCE = "int main() { return 0; }\n";

/**
 * The first Visual Studio generator this machine can actually configure with, newest first.
 *
 * `cmake --help` is a claim, not a fact, and this row branch was wrong once for trusting it: the
 * scratch project is configured with the exact argv the fixtures use, so the generator that wins
 * is the one that accepts `-A x64` here. Every candidate's failure is kept, so a runner with none
 * says why instead of skipping silently.
 */
export async function detectVsGenerator(
	candidates: string[],
	scratch: string,
	cmake: string,
	run: (bin: string, args: string[], cwd: string) => Promise<RunResult>,
): Promise<VsDetection> {
	const attempts: string[] = [];
	for (const name of candidates) {
		const root = join(scratch, name.replace(/[^A-Za-z0-9]+/g, "-"));
		mkdirSync(root, { recursive: true });
		writeFileSync(join(root, "CMakeLists.txt"), DETECT_MANIFEST);
		writeFileSync(join(root, "main.cpp"), DETECT_SOURCE);
		const args = ["-S", root, "-B", join(root, "build"), "-G", name, "-A", "x64"];
		const result = await run(cmake, args, root);
		if (result.code === 0) {
			attempts.push(`${name}: configured for x64`);
			return { generator: name, attempts };
		}
		attempts.push(`${name}: ${errorLines(result.stderr)[0] ?? `exited ${result.code}`}`);
	}
	return { generator: null, attempts };
}

/**
 * The first lines of a failing command's stderr, each short enough for a report.
 *
 * A CMake failure wraps its message over several lines — the rows used to print the first two, which
 * cut "Generator Visual Studio 17 2022 could not find any instance of Visual Studio" off after the
 * word "Generator", so the cause never appeared anywhere.
 */
export function errorLines(text: string, limit = 6): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.slice(0, limit)
		.map((line) => (line.length > 220 ? `${line.slice(0, 220)}…` : line));
}

/** Why a machine without clangd skips the analysis half. */
export const NO_CLANGD = "clangd is not on PATH";

/** What the plan, the probe's process runner and its clangd session are, as the row uses them. */
export interface WindowsHarness {
	/** The clangd binary, or null when this machine has none. */
	clangd: string | null;
	ask(flags?: { profile?: string; target?: string }): Promise<Plan>;
	run(bin: string, args: string[], cwd: string): Promise<RunResult>;
	analyse(probes: Fixture["probes"], args: string[]): Promise<Measurement[]>;
	compileArguments(database: string, source: string): string[] | null;
	commandLine(argv: string[]): string;
	firstError(text: string): string;
	isFile(path: string): boolean;
	/** Write the fixture's files into its root. */
	writeFixture(): void;
	/** Write the file API query into `<root>/<directory>`, before a configure reads it. */
	writeQuery(directory: string): void;
}

/**
 * One project, configured and built the way a CLion profile on Windows builds it.
 *
 * `generator` is the Visual Studio generator this machine can actually configure with, discovered by
 * [`detectVsGenerator`]; nothing here assumes a version, because the Windows images move and a
 * hardcoded one failed on an image that lists a newer generator only.
 *
 * `userBuild` is the fixture's own proof: the generator configures without a build type, builds
 * `Debug` through `--config`, and never writes a database — which is the premise both rows rest on.
 */
export function vsFixture(name: string, generator: string): Fixture {
	return {
		name,
		generator,
		files: {
			"CMakeLists.txt": `cmake_minimum_required(VERSION 3.20)
project(parity_vs CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# A library the app includes by a target include directory, so the synthesised command line has to
# carry an include path MSVC accepts for the project header to resolve at all.
add_library(parity_vs_core STATIC core/value.cpp)
target_include_directories(parity_vs_core PUBLIC \${CMAKE_CURRENT_SOURCE_DIR}/include)

add_executable(${VS_TARGET} app/main.cpp)
target_link_libraries(${VS_TARGET} PRIVATE parity_vs_core)

# The configuration that reached the compiler, readable from the program's own output.
target_compile_definitions(${VS_TARGET} PRIVATE
  $<$<CONFIG:Debug>:PARITY_VS_CONFIG=1>
  $<$<NOT:$<CONFIG:Debug>>:PARITY_VS_CONFIG=2>)
`,
			"include/parity/vs.h": `#pragma once

// _MSC_VER is defined by MSVC and by the compiler that impersonates it, so which overload a caller
// sees is the evidence that the analysis reads this tree's own toolchain rather than another one.
#ifdef _MSC_VER
int vs_toolchain(int value);
#else
int vs_toolchain(double value);
#endif

int parity_vs_value();
`,
			"core/value.cpp": `#include <parity/vs.h>

int vs_toolchain(int value) {
	return value;
}

int vs_toolchain(double value) {
	return static_cast<int>(value);
}

int parity_vs_value() {
	return 5;
}
`,
			"app/main.cpp": `#include <parity/vs.h>

#include <cstdio>
#include <vector>

int main() {
	std::vector<int> values{vs_toolchain(parity_vs_value())};
	std::printf("config=%d value=%d size=%zu\\n", PARITY_VS_CONFIG, values.front(), values.size());
	return 0;
}
`,
		},
		userBuild: [
			[
				"-S",
				".",
				"-B",
				VS_BUILD_DIR,
				"-G",
				generator,
				"-A",
				"x64",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
			],
			["--build", VS_BUILD_DIR, "--config", "Debug"],
		],
		userDb: `${VS_BUILD_DIR}/compile_commands.json`,
		dbOptional: true,
		probes: [
			{
				file: "app/main.cpp",
				needle: "parity_vs_value()",
				needs: "the library include path from target_include_directories",
				expect: "int parity_vs_value()",
			},
			{
				file: "app/main.cpp",
				needle: "vs_toolchain(parity_vs_value())",
				needs: "the int overload, which only a tree compiled with MSVC's defines declares",
				expect: "int vs_toolchain(int value)",
			},
			{
				file: "app/main.cpp",
				// The position is the start of `values`, so the hover is the variable's declared
				// type — which is what says the standard header resolved at all.
				needle: "values.size()",
				needs: "<vector> resolved through the compiler this project was built with",
				expect: "std::vector<int>",
			},
		],
	};
}

/** The two configurations each row builds, and what the program prints for each. */
export interface VsHalf {
	profile: string;
	configuration: string;
	printed: string;
	/** The `PARITY_VS_CONFIG` this configuration defines, which its analysis must read. */
	level: number;
}

export const VS_HALVES: VsHalf[] = [
	{ profile: "debug", configuration: "Debug", printed: "config=1", level: 1 },
	{ profile: "release", configuration: "Release", printed: "config=2", level: 2 },
];

/**
 * The position that proves analysis read *this* configuration's command.
 *
 * The fixture defines `PARITY_VS_CONFIG` per configuration through a generator expression, so the
 * macro's value is the configuration itself; a database holding another configuration's entries
 * answers the other number. This is the same signal the multi-config row uses for `PARITY_LEVEL`.
 */
export function configProbe(half: VsHalf): {
	file: string;
	needle: string;
	needs: string;
	expect: string;
} {
	return {
		file: "app/main.cpp",
		needle: "PARITY_VS_CONFIG",
		needs: `the ${half.configuration} compile command, which defines PARITY_VS_CONFIG=${half.level}`,
		expect: `Value = \`${half.level}\``,
	};
}

/**
 * Whether a failed configure names an environment gap rather than a product defect.
 *
 * The generator is listed by a cmake that has Visual Studio behind it; a machine that lists it
 * without the C++ toolset fails the configure instead, and that is a skip with a reason, never a
 * finding against quarry.
 */
export function toolsetMissing(stderr: string): boolean {
	return /could not find any instance of Visual Studio|No CMAKE_CXX_COMPILER could be found|is not able to compile a simple test program/i.test(
		stderr,
	);
}
