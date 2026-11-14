/**
 * The one project shape both Windows rows share: a library plus an app, and a define that differs
 * per configuration so a build's own output says which configuration reached the compiler.
 */

import type { AnalysisProbe, Fixture } from "./types";

/** The tree the fixture's own build writes, which is CLion's shape on Windows. */
export const VS_BUILD_DIR = "build";

/** The executable the project defines; the artefact a plan must name is `<build>/<Config>/this`. */
export const VS_TARGET = "parity_vs";

/** The file the build writes for that target, named the way a link on Windows names it. */
export const VS_EXE = `${VS_TARGET}.exe`;

/**
 * One project, configured and built the way a CLion profile on Windows builds it.
 *
 * `generator` is the Visual Studio generator this machine can actually configure with, discovered by
 * `detectVsGenerator` in `windows.ts`; nothing here assumes a version, because the Windows images
 * move and a hardcoded one failed on an image that lists a newer generator only.
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
export function configProbe(half: VsHalf): AnalysisProbe {
	return {
		file: "app/main.cpp",
		needle: "PARITY_VS_CONFIG",
		needs: `the ${half.configuration} compile command, which defines PARITY_VS_CONFIG=${half.level}`,
		expect: `Value = \`${half.level}\``,
	};
}
