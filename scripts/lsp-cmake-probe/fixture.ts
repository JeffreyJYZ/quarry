/**
 * The throwaway CMake project the probe measures: a local header under `include/` and an `extern`
 * declaration that header promises, so "the header was found" and "the symbol is known" are two
 * separate readings.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CMAKE_LISTS = `cmake_minimum_required(VERSION 3.20)
project(teacher_demo CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(demo src/main.cpp src/mathx.cpp)
target_include_directories(demo PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)
`;

const HEADER = `#pragma once

extern int mathx_counter;
int mathx_double(int value);
`;

const LIBRARY = `#include <mathx.hpp>

int mathx_counter = 0;

int mathx_double(int value) { return value * 2; }
`;

const MAIN = `#include <cstdio>

#include <mathx.hpp>

int main() {
    mathx_counter = 2;
    std::printf("%d\\n", mathx_double(mathx_counter));
    return 0;
}
`;

/** Writes the project and returns its directory. */
export function writeProject(): string {
	const project = mkdtempSync(join(tmpdir(), "quarry-cmake-probe-"));
	writeFileSync(join(project, "CMakeLists.txt"), CMAKE_LISTS);
	for (const [name, text] of [
		["src/main.cpp", MAIN],
		["src/mathx.cpp", LIBRARY],
		["include/mathx.hpp", HEADER],
	] as const) {
		mkdirSync(dirname(join(project, name)), { recursive: true });
		writeFileSync(join(project, name), text);
	}
	return project;
}

/** The line the hover goes on: the assignment the extern declaration promises. */
export const HOVER_MARKER = "mathx_counter = 2";
export const HOVER_TOKEN = "mathx_counter";
