/**
 * A multi-config tree: one target, two configurations, each with its own output directory and its
 * own value of a per-configuration define.
 */

import { cmakeHeader, type Fixture } from "./types";

/**
 * The `PARITY_LEVEL` each configuration compiles with, which is also what its analysis must read.
 *
 * The number is a per-configuration define in the fixture manifest, so the build proves the flags
 * reach the compiler and a hover proves the analysis is reading this configuration's command and
 * not the `Debug` entry that leads the database's array.
 */
export const MULTI_CONFIG_LEVELS: Record<string, number> = {
	Debug: 1,
	Release: 2,
	RelWithDebInfo: 3,
	MinSizeRel: 4,
};

/**
 * A multi-config tree: one target, two configurations, each with its own output directory.
 *
 * `Ninja Multi-Config` takes its configuration at build time and writes no `compile_commands.json`,
 * so the tree is configured once and built twice. `CMAKE_BUILD_TYPE` is deliberately never set —
 * that is the hand-off rule this fixture measures, and a configure that forces one has already
 * broken the tree it is asking about.
 *
 * The define is the per-configuration signal: `PARITY_LEVEL` is a different number in each
 * configuration, so a hover that answers the number of the configuration being built is the only
 * proof that analysis and build agree. A database holding every configuration's entries, or the
 * previous profile's, answers the wrong number.
 */
export function multiConfigFixture(generator: string): Fixture {
	return {
		name: `multi-config: ${generator}`,
		files: {
			"CMakeLists.txt": `${cmakeHeader("parity_multiconfig")}
add_executable(parity_multiconfig main.cpp variant.cpp)
target_compile_definitions(parity_multiconfig PRIVATE
	PARITY_LEVEL=$<IF:$<CONFIG:Debug>,1,$<IF:$<CONFIG:Release>,2,$<IF:$<CONFIG:RelWithDebInfo>,3,4>>>)
`,
			"variant.cpp": `int variant() {
	return 7;
}
`,
			"main.cpp": `#include <cstdio>

int variant();

int main() {
	std::printf("variant=%d level=%d\\n", variant(), PARITY_LEVEL);
	return 0;
}
`,
		},
		userBuild: [
			["-S", ".", "-B", "build", "-G", generator, "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"],
		],
		probes: [],
	};
}
