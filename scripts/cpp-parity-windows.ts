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

import type { Fixture } from "./cpp-parity-fixtures";
import type { Measurement, Plan, RunResult } from "./cpp-parity-probe";

/** The generator a Visual Studio 2022 CLion profile names. */
export const VS_GENERATOR = "Visual Studio 17 2022";

/** The tree the fixture's own build writes, which is CLion's shape on Windows. */
export const VS_BUILD_DIR = "build";

/** The executable the project defines; the artefact a plan must name is `<build>/<Config>/this`. */
export const VS_TARGET = "parity_vs";

/** The file the build writes for that target, named the way a link on Windows names it. */
export const VS_EXE = `${VS_TARGET}.exe`;

/** Why a machine without the generator skips both rows, in words that name the fix. */
export const NO_VS = `cmake lists no "${VS_GENERATOR}" generator (install Visual Studio 2022 with the C++ workload)`;

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
 * How many `compile_commands.json` entries a synthesised database holds for the fixture.
 *
 * One per source per configuration: the reply names every configuration the generator supports, so
 * four configurations and two compilable sources make eight.
 */
export const VS_ENTRIES = 8;

/**
 * One project, configured and built the way a CLion profile on Windows builds it.
 *
 * `userBuild` is the fixture's own proof: the generator configures without a build type, builds
 * `Debug` through `--config`, and never writes a database — which is the premise both rows rest on.
 */
export function vsFixture(name: string): Fixture {
	return {
		name,
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
				VS_GENERATOR,
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
				needle: "values.size()",
				needs: "<vector> resolved through the compiler this project was built with",
				expect: "size()",
			},
		],
	};
}

/** The two configurations each row builds, and what the program prints for each. */
export interface VsHalf {
	profile: string;
	configuration: string;
	printed: string;
}

export const VS_HALVES: VsHalf[] = [
	{ profile: "debug", configuration: "Debug", printed: "config=1" },
	{ profile: "release", configuration: "Release", printed: "config=2" },
];

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

/** Why a machine with no Visual Studio toolset skips both rows. */
export const NO_TOOLSET =
	"the Visual Studio generator needs the MSVC C++ toolset and this machine has none";
