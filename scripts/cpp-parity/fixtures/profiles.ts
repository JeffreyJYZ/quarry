/**
 * The fixtures that are one project shape under a variable: the build type, and the number of
 * executables a build may or may not name.
 */

import { cmakeHeader, type Fixture } from "./types";

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
