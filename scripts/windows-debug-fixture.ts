#!/usr/bin/env bun
/**
 * The project the Windows debugger row debugs: two translation units, linked, built by the Visual
 * Studio generator in `Debug`.
 *
 * Two files rather than one on purpose. A single-file program cannot show that a stopped frame
 * names the source it came from, and the product's whole C/C++ path is a library plus an app that
 * includes it. The breakpoint statement and the statement after it are named rather than numbered,
 * so a line number is never written down twice: [`lineOf`] answers from the text the build compiles.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The target's name, which the generator writes as `build/Debug/<name>.exe`. */
export const TARGET = "parity_windows_debug";

/** The configuration the row builds: debug info, no optimisation, which is what a debugger needs. */
export const CONFIGURATION = "Debug";

/** The shared header, so the app calls the library's function rather than copying it. */
export const HEADER = `#pragma once

int add(int left, int right);
`;

/** The library's one unit. */
export const CORE = `#include "value.h"

int add(int left, int right) {
	return left + right;
}
`;

/** The app: a local that changes value across the statement the row steps over. */
export const MAIN = `#include "value.h"

#include <cstdio>

int main() {
	int total = 0;
	total = add(2, 3);
	std::printf("total=%d\\n", total);
	return 0;
}
`;

/** The statement the breakpoint goes on; `total` is 0 there and 5 after the next one runs. */
export const BREAKPOINT_NEEDLE = "total = add(";

/** The statement a step-over reaches. */
export const STEP_NEEDLE = "std::printf(";

/** The manifest, which links the two units and shares the header by target include directory. */
export const MANIFEST = `cmake_minimum_required(VERSION 3.20)
project(${TARGET} CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(parity_windows_core STATIC core/value.cpp)
target_include_directories(parity_windows_core PUBLIC \${CMAKE_CURRENT_SOURCE_DIR}/include)

add_executable(${TARGET} app/main.cpp)
target_link_libraries(${TARGET} PRIVATE parity_windows_core)
`;

/** The 1-based line of the first line containing `needle`; a missing needle is a defect here. */
export function lineOf(source: string, needle: string): number {
	const index = source.split(/\r?\n/).findIndex((line) => line.includes(needle));
	if (index < 0) throw new Error(`no line contains ${needle}`);
	return index + 1;
}

/** The path the row sets its breakpoint in, relative to the project root. */
export const MAIN_SOURCE = join("app", "main.cpp");

/** Write the project into `root` and answer with the file the breakpoint belongs to. */
export function writeFixture(root: string): string {
	mkdirSync(join(root, "app"), { recursive: true });
	mkdirSync(join(root, "core"), { recursive: true });
	mkdirSync(join(root, "include"), { recursive: true });
	writeFileSync(join(root, "CMakeLists.txt"), MANIFEST);
	writeFileSync(join(root, "include", "value.h"), HEADER);
	writeFileSync(join(root, "core", "value.cpp"), CORE);
	writeFileSync(join(MAIN_SOURCE), MAIN);
	return join(root, MAIN_SOURCE);
}

/** The binary the generator writes for this target, named the way Windows names an executable. */
export function programPath(build: string, platform: string = process.platform): string {
	const suffix = platform === "win32" ? ".exe" : "";
	return join(build, CONFIGURATION, `${TARGET}${suffix}`);
}
