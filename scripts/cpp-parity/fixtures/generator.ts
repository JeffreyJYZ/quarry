/**
 * A fixture used once per generator CMake offers, so a generator that writes no compiler database
 * can be told from one that does.
 */

import { cmakeHeader, type Fixture } from "./types";

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
