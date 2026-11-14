/**
 * The second toolchain: a C and C++ project CMake builds with Homebrew GCC, once bare and once
 * behind a launcher the way a `ccache` tree is configured.
 */

import type { AnalysisProbe, Fixture } from "./types";

/** The compiler pair a second toolchain is made of, as the fixture's toolchain file names it. */
export interface ToolchainPaths {
	cc: string;
	cxx: string;
}

/** What the fixture program prints when every one of its three values arrived: 1 + 16 + 16. */
export const GCC_STDOUT = "gcc=33";

/**
 * The one CMake project both GCC fixtures are: a library, an app and a C file through one header.
 *
 * The header makes the toolchain visible in a hover rather than in a diagnostic. libstdc++ defines
 * `__GLIBCXX__` and libc++ does not, so the same call resolves to the `int` overload only when the
 * analysis is reading the headers of the compiler this project was built with. The
 * `<bits/stdc++.h>` include is the standard header only GCC ships: with the wrong headers it does
 * not resolve at all.
 */
function gccFiles(gcc: ToolchainPaths): Record<string, string> {
	return {
		"CMakeLists.txt": `cmake_minimum_required(VERSION 3.20)
project(parity_gcc C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(parity_gcc main.cpp library.cpp standard.cpp value.c)
target_include_directories(parity_gcc PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)
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
        "CMAKE_TOOLCHAIN_FILE": "\${sourceDir}/toolchains/gcc.cmake"
      }
    }
  ],
  "buildPresets": [{ "name": "debug", "configurePreset": "debug" }]
}
`,
		"toolchains/gcc.cmake": `# The second toolchain: naming the compilers here is what makes this tree a GCC one.
set(CMAKE_C_COMPILER ${gcc.cc})
set(CMAKE_CXX_COMPILER ${gcc.cxx})
`,
		"include/parity/gcc.h": `#pragma once

#include <string>

// libstdc++ defines __GLIBCXX__ and libc++ does not, so only the analysis reading the headers of
// the compiler this project builds with declares the int overload.
#ifdef __GLIBCXX__
int gcc_standard(int value);
#else
int gcc_standard(double value);
#endif

int gcc_project();
`,
		"standard.cpp": `#include <parity/gcc.h>

int gcc_standard(int value) {
\treturn value;
}

int gcc_standard(double value) {
\treturn static_cast<int>(value);
}
`,
		"library.cpp": `#include <parity/gcc.h>

int gcc_project() {
\treturn 16;
}
`,
		"value.c": `int c_value(void) {
\treturn 16;
}
`,
		"main.cpp": `#include <parity/gcc.h>

#include <bits/stdc++.h>

extern "C" int c_value(void);

int main() {
\tstd::cout << "gcc=" << gcc_standard(1) + gcc_project() + c_value() << "\\n";
\treturn 0;
}
`,
	};
}

/** The positions both GCC fixtures are judged at: the overload and the project's own header. */
function gccProbes(): AnalysisProbe[] {
	return [
		{
			file: "main.cpp",
			needle: "gcc_standard(1)",
			needs: "the int overload, which only libstdc++'s __GLIBCXX__ declares",
			expect: "int gcc_standard(int value)",
		},
		{
			file: "main.cpp",
			needle: "gcc_project()",
			needs: "the project header, through the include path this build records",
			expect: "int gcc_project()",
		},
	];
}

/**
 * A C and C++ project built by a second toolchain, the one CLion users keep beside Apple clang.
 *
 * The preset names a toolchain file, and the toolchain file names both compilers — the shape a
 * CMake project carries when its user picked a compiler CMake does not find on its own. That is
 * also the shape clangd cannot analyse unaided: it recognises clang by name, so a project built by
 * GCC needs `--query-driver` or the analysis reads the platform's libc++ headers instead.
 */
export function gccToolchainFixture(gcc: ToolchainPaths): Fixture {
	return { name: "toolchain: gcc", files: gccFiles(gcc), probes: gccProbes() };
}

/**
 * The same project with the compiler behind a launcher, the shape a `ccache`-wrapped tree has.
 *
 * A shell script that `exec`s its arguments stands in for `ccache`, which is not installed on every
 * machine; it is named `ccache` because that is a wrapper clangd itself knows to look through, and
 * an arbitrary name would leave the analysis unable to use the command at all — measuring the name
 * rather than the hand-off. The toolchain file names the launcher as the compiler and the real
 * compiler as its first argument, which is how such a tree is configured; CMake then records the
 * launcher in its compiler record, and every command in the database starts with the launcher and
 * names the compiler second. A hand-off that stops at the first word has nothing to give clangd, so
 * this fixture is the one that tells a launcher from the driver behind it.
 */
export function gccLauncherFixture(gcc: ToolchainPaths): Fixture {
	const files = gccFiles(gcc);
	files["toolchains/gcc.cmake"] =
		`# A launcher in front of the compiler, as ccache would be: the real compiler is its first word.
set(CMAKE_C_COMPILER \${CMAKE_CURRENT_LIST_DIR}/../ccache)
set(CMAKE_C_COMPILER_ARG1 ${gcc.cc})
set(CMAKE_CXX_COMPILER \${CMAKE_CURRENT_LIST_DIR}/../ccache)
set(CMAKE_CXX_COMPILER_ARG1 ${gcc.cxx})
`;
	files["ccache"] = `#!/bin/sh
# Stands in for ccache: a launcher that runs the compiler it is handed.
exec "$@"
`;
	return {
		name: "toolchain: gcc behind a launcher",
		files,
		executables: ["ccache"],
		probes: gccProbes(),
	};
}
