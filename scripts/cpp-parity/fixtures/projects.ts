/**
 * Projects whose answer is in their build files: a library plus an app, and standard headers through
 * the compiler CMake chose.
 */

import { cmakeHeader, type Fixture } from "./types";

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
