/**
 * The two fixtures whose build system carries the answer: a configure preset that is the only
 * source of an option, and a toolchain file named by a preset cache variable.
 */

import { cmakeHeader, type Fixture } from "./types";

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
