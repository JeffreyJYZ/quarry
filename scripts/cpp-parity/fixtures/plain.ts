/**
 * The projects quarry builds itself, with no build system to borrow flags from: a C++ one, and one
 * whose C and C++ translation units meet through a single header.
 */

import type { Fixture } from "./types";

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
 * A plain project whose C and C++ translation units meet through one header.
 *
 * The C file is C only: `void *` converts to `int *` implicitly in C and not in C++, so compiling
 * it as C++ fails outright. That is the point — a project-wide `-std=c++20` and one C++ driver for
 * every source, which is what a mixed tree must not do, cannot build this fixture. The header is
 * the boundary: `extern "C"` in C++, a plain declaration in C, so the link agrees on one symbol.
 */
export function mixedLanguagesFixture(): Fixture {
	return {
		name: "mixed-languages",
		kind: "plain",
		files: {
			"include/parity/mix.h": `#pragma once

#ifdef __cplusplus
extern "C" {
#endif
int mix_value(int seed);
#ifdef __cplusplus
}
#endif
`,
			"mix.c": `#include <parity/mix.h>

#include <stdlib.h>

/* \`void *\` converts to \`int *\` in C and not in C++, so only a C compile of this file succeeds. */
int mix_value(int seed) {
	int *values = malloc(sizeof(int));
	values[0] = seed;
	int result = values[0];
	free(values);
	return result;
}
`,
			"main.cpp": `#include <parity/mix.h>

#include <iostream>

int main() {
	std::cout << "mix=" << mix_value(21) << "\\n";
	return 0;
}
`,
		},
		plainBuild: [
			["clang", "-std=c17", "-Iinclude", "-c", "mix.c", "-o", "mix.o"],
			["clang++", "-std=c++20", "-Iinclude", "-c", "main.cpp", "-o", "main.o"],
			["clang++", "-o", "mixed", "mix.o", "main.o"],
		],
		probes: [
			{
				file: "mix.c",
				needle: "mix_value(int seed) {",
				needs: "the C driver and the C standard: a .c entry is not a C++ command",
				expect: "int mix_value(int seed)",
			},
			{
				file: "main.cpp",
				needle: "mix_value(21)",
				needs: 'the extern "C" declaration through the C++ compiler',
				expect: "int mix_value(int seed)",
			},
		],
	};
}
