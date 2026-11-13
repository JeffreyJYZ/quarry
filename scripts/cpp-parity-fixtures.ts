/**
 * Fixture projects for `cpp-parity-probe.ts`, each one a shape a CLion C/C++ user actually has.
 *
 * Every fixture is a real CMake project with a real build directory, laid out the way CLion lays one
 * out: a `CMakePresets.json` with its own `binaryDir`, a toolchain file named by a preset cache
 * variable, a library plus an app that includes the library by a build-system-only path, a project
 * CLion configured into `cmake-build-debug/`, and a file that uses standard headers through the
 * compiler CMake chose.
 *
 * The probe writes these into a temp directory, builds each one the way CLion would, then asks what
 * quarry does with the same tree. Nothing here is a toy: every source file compiles with the flags
 * its build directory records, and its analysis position needs those flags.
 */

/** One position in one file that only a build-aware language server can answer. */
export interface AnalysisProbe {
	/** Path inside the fixture. */
	file: string;
	/** Text to point at; the probe hovers the first occurrence. */
	needle: string;
	/** What the position needs from the compile command, for the findings. */
	needs: string;
	/**
	 * Text a correct hover must contain. This is the standard the analysis is judged against: the
	 * fixture's own build guarantees it, so a hover that lacks it is analysing other flags.
	 */
	expect: string;
}

export interface Fixture {
	/** Directory name under the probe's temp root, and the table's capability label. */
	name: string;
	/** Relative path to file contents. */
	files: Record<string, string>;
	/**
	 * `"cmake"` for a project with a build system (the default), `"plain"` for one quarry compiles
	 * itself: the latter has no manifest, no database and no build of its own to borrow flags from.
	 */
	kind?: "cmake" | "plain";
	/** The build a CLion user's project already has, argv arrays run in order. */
	userBuild?: string[][];
	/** Where that build writes `compile_commands.json`, relative to the fixture root. */
	userDb?: string;
	/**
	 * True when this fixture's whole point is that the build may record no database (a generator that
	 * ignores `CMAKE_EXPORT_COMPILE_COMMANDS`), so a missing one is a finding, not a broken fixture.
	 */
	dbOptional?: boolean;
	/** A plain project's own build, argv arrays run in order: its proof that its sources compile. */
	plainBuild?: string[][];
	/** Positions the analysis is judged at. */
	probes: AnalysisProbe[];
}

/** The two lines every fixture manifest opens with. */
function cmakeHeader(project: string): string {
	return `cmake_minimum_required(VERSION 3.20)\nproject(${project} CXX)\n`;
}

/** A CMake project whose only source of `PARITY_MODE` is the configure preset. */
export function presetsFixture(): Fixture {
	return {
		name: "presets",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_presets")}
# PARITY_MODE is set by the \`debug\` configure preset and nowhere else, which is how a real
# project carries an option: a build that ignores CMakePresets cannot configure this tree.
if(NOT PARITY_MODE)
  message(FATAL_ERROR "PARITY_MODE is unset: configure through the debug preset")
endif()
add_compile_definitions(PARITY_PRESET_MODE=\${PARITY_MODE})

add_executable(parity_presets main.cpp preset.cpp)
target_include_directories(parity_presets PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)
`,
			"CMakePresets.json": `{
  "version": 6,
  "configurePresets": [
    {
      "name": "debug",
      "displayName": "Debug",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/out/debug",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_EXPORT_COMPILE_COMMANDS": "ON",
        "PARITY_MODE": "20"
      }
    }
  ],
  "buildPresets": [{ "name": "debug", "configurePreset": "debug" }]
}
`,
			"include/parity/preset.h": `#pragma once

int parity_preset_value();
`,
			"preset.cpp": `int parity_preset_value() {
\treturn 20;
}
`,
			"main.cpp": `#include <parity/preset.h>

#if !defined(PARITY_PRESET_MODE) || PARITY_PRESET_MODE != 20
#error "build this tree through the debug configure preset"
#endif

int main() {
\treturn parity_preset_value();
}
`,
		},
		userBuild: [
			["--preset", "debug"],
			["--build", "--preset", "debug"],
		],
		userDb: "out/debug/compile_commands.json",
		probes: [
			{
				file: "main.cpp",
				needle: "parity_preset_value()",
				needs: "the preset's binary dir, which holds the only compile_commands.json",
				expect: "int parity_preset_value()",
			},
		],
	};
}

/** A toolchain file named by a preset cache variable, whose define selects an overload. */
export function toolchainFixture(): Fixture {
	return {
		name: "toolchain",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_toolchain")}
add_executable(parity_toolchain main.cpp marker.cpp)
target_include_directories(parity_toolchain PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)
`,
			"CMakePresets.json": `{
  "version": 6,
  "configurePresets": [
    {
      "name": "debug",
      "displayName": "Debug",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/out/debug",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_EXPORT_COMPILE_COMMANDS": "ON",
        "CMAKE_TOOLCHAIN_FILE": "\${sourceDir}/toolchains/parity.cmake"
      }
    }
  ],
  "buildPresets": [{ "name": "debug", "configurePreset": "debug" }]
}
`,
			"toolchains/parity.cmake": `# Stands in for the platform toolchain file a CLion project names in CMAKE_TOOLCHAIN_FILE.
add_compile_definitions(PARITY_TOOLCHAIN=1)
`,
			"include/parity/marker.h": `#pragma once

// The toolchain file selects the int overload; without its define only the double one exists, so
// the call still compiles and only the analysis can tell the two apart.
#ifdef PARITY_TOOLCHAIN
int toolchain_marker(int value);
#else
int toolchain_marker(double value);
#endif
`,
			"marker.cpp": `int toolchain_marker(int value) {
\treturn value;
}

int toolchain_marker(double value) {
\treturn static_cast<int>(value);
}
`,
			"main.cpp": `#include <parity/marker.h>

int main() {
\treturn toolchain_marker(1);
}
`,
		},
		userBuild: [
			["--preset", "debug"],
			["--build", "--preset", "debug"],
		],
		userDb: "out/debug/compile_commands.json",
		probes: [
			{
				file: "main.cpp",
				needle: "toolchain_marker(1)",
				needs: "PARITY_TOOLCHAIN from the toolchain file, which picks the int overload",
				expect: "int toolchain_marker(int value)",
			},
		],
	};
}

/**
 * A library plus an app that includes it by a path only `target_include_directories` knows, with an
 * `extern` variable declared in the header and defined in the library's `.cpp`. CLion configures this
 * into `cmake-build-debug/`; nothing about it is unusual.
 */
export function multiTargetFixture(): Fixture {
	return {
		name: "multi-target",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_multi")}
set(CMAKE_CXX_STANDARD 20)

add_library(parity_core STATIC core/counter.cpp)
target_include_directories(parity_core PUBLIC \${CMAKE_CURRENT_SOURCE_DIR}/include)

add_executable(parity_app app/main.cpp)
target_link_libraries(parity_app PRIVATE parity_core)
`,
			"include/parity/counter.h": `#pragma once

// Declared here and defined in core/counter.cpp: the extern-through-a-header shape.
extern int parity_counter;

int parity_bump();
`,
			"core/counter.cpp": `#include <parity/counter.h>

int parity_counter = 41;

int parity_bump() {
\treturn 1;
}
`,
			"app/main.cpp": `#include <parity/counter.h>

int main() {
\treturn parity_bump() + parity_counter;
}
`,
		},
		userBuild: [
			[
				"-S",
				".",
				"-B",
				"cmake-build-debug",
				"-DCMAKE_BUILD_TYPE=Debug",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
			],
			["--build", "cmake-build-debug"],
		],
		userDb: "cmake-build-debug/compile_commands.json",
		probes: [
			{
				file: "app/main.cpp",
				needle: "parity_bump()",
				needs: "the library include path from target_include_directories",
				expect: "int parity_bump()",
			},
			{
				file: "app/main.cpp",
				needle: "parity_counter",
				needs: "the library include path, so the extern declaration is visible",
				expect: "extern int parity_counter",
			},
		],
	};
}

/** Standard headers and a C entry point, in C++20: the standard is a compile-command fact. */
export function systemHeaderFixture(): Fixture {
	return {
		name: "system-headers",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_system")}
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(parity_capi STATIC capi.cpp)
target_include_directories(parity_capi PUBLIC \${CMAKE_CURRENT_SOURCE_DIR}/include)

add_executable(parity_system main.cpp)
target_link_libraries(parity_system PRIVATE parity_capi)
`,
			"include/parity/capi.h": `#pragma once

#ifdef __cplusplus
extern "C" {
#endif
int parity_c_api(int value);
#ifdef __cplusplus
}
#endif
`,
			"capi.cpp": `#include <parity/capi.h>

#include <vector>

extern "C" int parity_c_api(int value) {
\treturn value + 1;
}
`,
			"main.cpp": `#include <parity/capi.h>

#include <format>
#include <string>
#include <vector>

int main() {
\tstd::vector<int> values{parity_c_api(1)};
\tstd::string text = std::format("{}", values.front());
\treturn static_cast<int>(text.size());
}
`,
		},
		userBuild: [
			[
				"-S",
				".",
				"-B",
				"build",
				"-DCMAKE_BUILD_TYPE=Debug",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
			],
			["--build", "build"],
		],
		userDb: "build/compile_commands.json",
		probes: [
			{
				file: "main.cpp",
				needle: "format(",
				needs: "CMAKE_CXX_STANDARD 20 recorded in the compile command: <format> is C++20 only",
				expect: "basic_string<char>",
			},
			{
				file: "main.cpp",
				needle: "parity_c_api(1)",
				needs: 'the extern "C" declaration from the library header',
				expect: "int parity_c_api(int value)",
			},
		],
	};
}

/**
 * A project configured with one generator and no `-std` guess, used per generator CMake offers.
 *
 * The generator is picked the way a CLion CMake profile picks one, and the tree is CLion's own
 * `cmake-build-debug`; the analysis position is the C++20 one, so a generator that writes no
 * `compile_commands.json` leaves clangd with nothing to answer from unless the product makes one.
 */
export function generatorFixture(label: string, generator: string): Fixture {
	const directory = "cmake-build-debug";
	return {
		name: label,
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_gen")}
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(parity_gen main.cpp)
`,
			"main.cpp": `#include <format>
#include <string>

int main() {
\treturn static_cast<int>(std::format("{}", 1).size());
}
`,
		},
		userBuild: [
			[
				"-S",
				".",
				"-B",
				directory,
				"-G",
				generator,
				"-DCMAKE_BUILD_TYPE=Debug",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
			],
			["--build", directory, "--config", "Debug"],
		],
		userDb: `${directory}/compile_commands.json`,
		dbOptional: true,
		probes: [
			{
				file: "main.cpp",
				needle: "format(",
				needs: "the C++ standard from the compile command this generator writes, if it writes one",
				expect: "basic_string<char>",
			},
		],
	};
}

/**
 * A C++ project with no build system at all: no `CMakeLists.txt`, no `compile_commands.json`.
 *
 * quarry compiles this one itself, so the flags the analysis needs are the ones that build derives
 * rather than ones a generator recorded: the project root on the search path (a header included by
 * its root-relative path), the define the project's own settings state, and a C++ standard above the
 * compiler's default. None of the three is discoverable from the source tree alone, which is why a
 * hand-off with no arguments leaves the analysis unable to answer any of these positions.
 */
export function plainFixture(): Fixture {
	return {
		name: "plain",
		kind: "plain",
		files: {
			"lib/greet.h": `#pragma once

#ifndef PARITY_PLAIN
#error "PARITY_PLAIN comes from the project's own flags"
#endif
int plain_greeting();
`,
			"lib/greet.cpp": `#include "greet.h"

int plain_greeting() {
\treturn PARITY_PLAIN;
}
`,
			"src/main.cpp": `#include "lib/greet.h"

#include <format>
#include <string>

int main() {
\treturn static_cast<int>(std::format("{}", plain_greeting()).size());
}
`,
			".quarry/settings.json": `{ "cppFlags": "-DPARITY_PLAIN=1" }
`,
		},
		plainBuild: [
			[
				"clang++",
				"-std=c++20",
				"-DPARITY_PLAIN=1",
				"-I",
				".",
				"-o",
				"app",
				"src/main.cpp",
				"lib/greet.cpp",
			],
		],
		probes: [
			{
				file: "src/main.cpp",
				needle: "plain_greeting()",
				needs: "the project root on the include path, which only this build's own flags give",
				expect: "int plain_greeting()",
			},
			{
				file: "src/main.cpp",
				needle: "format(",
				needs: "the C++20 standard this build passes: <format> is C++20 only",
				expect: "basic_string<char>",
			},
		],
	};
}

/**
 * One executable and nothing else: the project's build type is the only thing under test.
 *
 * The plan always passes `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, so every object it compiles records
 * the flags CMake chose for the profile, and that record is where "the profile reached the
 * compiler" is read rather than inferred from the argv alone.
 */
export function profileFixture(): Fixture {
	return {
		name: "profile",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_profile")}
add_executable(parity_profile main.cpp)
`,
			"main.cpp": `int main() {
\treturn 0;
}
`,
		},
		probes: [],
	};
}

/**
 * Two executables, so building one can be told apart from building everything.
 *
 * A one-target build leaves the other absent; the same tree built with no target writes both. The
 * artefacts are the only evidence that matters: the argv could name a target and CMake could still
 * have built the whole tree.
 */
export function twoTargetsFixture(): Fixture {
	return {
		name: "two-targets",
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_two_targets")}
add_executable(parity_one one.cpp)
add_executable(parity_two two.cpp)
`,
			"one.cpp": `int main() {
\treturn 1;
}
`,
			"two.cpp": `int main() {
\treturn 2;
}
`,
		},
		probes: [],
	};
}

/** The character offset of `needle` as an LSP position. */ export function positionOf(
	text: string,
	needle: string,
): { line: number; character: number } {
	const index = text.indexOf(needle);
	if (index < 0) throw new Error(`needle not found in source: ${JSON.stringify(needle)}`);
	const before = text.slice(0, index);
	const line = before.split("\n").length - 1;
	return { line, character: index - before.lastIndexOf("\n") - 1 };
}
