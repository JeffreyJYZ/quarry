#!/usr/bin/env bun
/**
 * The project the Windows debugger row debugs: two translation units, linked, built by a
 * multi-config generator in `Debug`.
 *
 * Two files rather than one on purpose. A single-file program cannot show that a stopped frame
 * names the source it came from, and the product's whole C/C++ path is a library plus an app that
 * includes it. The breakpoint statement and the statement after it are named rather than numbered,
 * so a line number is never written down twice: [`lineOf`] answers from the text the build compiles.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The target's name, which a multi-config generator writes as `build/<Config>/<name><suffix>`. */
export const TARGET = "parity_windows_debug";

/** The configuration the row builds: debug info, no optimisation, which is what a debugger needs. */
export const CONFIGURATION = "Debug";

/** What an executable is called on a platform: `.exe` on Windows, nothing anywhere else. */
export function exeSuffix(platform: string = process.platform): string {
	return platform === "win32" ? ".exe" : "";
}

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

/** Every file of the project, relative to the root it is written into. */
export const FILES: { relative: string; text: string }[] = [
	{ relative: "CMakeLists.txt", text: MANIFEST },
	{ relative: join("include", "value.h"), text: HEADER },
	{ relative: join("core", "value.cpp"), text: CORE },
	{ relative: MAIN_SOURCE, text: MAIN },
];

/**
 * Write the project into `root` and answer with the file the breakpoint belongs to.
 *
 * Every path is composed from `root` and every file's directory is created first: the first run of
 * this row on Windows died here, with `writeFixture` writing `app/main.cpp` relative to the process
 * cwd — a fixture that would pass on a machine whose cwd happened to hold a stale `app/`, and fail
 * everywhere else. Nothing here may depend on a directory it did not create.
 */
export function writeFixture(root: string): string {
	for (const file of FILES) {
		const path = join(root, file.relative);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, file.text);
	}
	return join(root, MAIN_SOURCE);
}

/** What the binary the build was supposed to write is missing, when a build succeeds and writes
 *  nothing. Named here because the project's layout is what decides the path. */
export function artifactList(build: string): string {
	const parts = [listing(build, "build")];
	const configuration = join(build, CONFIGURATION);
	if (existsSync(configuration)) parts.push(listing(configuration, `build/${CONFIGURATION}`));
	return parts.join("; ");
}

/** One directory's first entries, named, or the reason it could not be read. */
function listing(directory: string, label: string): string {
	try {
		const entries = readdirSync(directory).slice(0, 12);
		return `${label} holds ${entries.length === 0 ? "nothing" : entries.join(", ")}`;
	} catch {
		return `${label} does not exist`;
	}
}

/**
 * The binary the generator writes for this target.
 *
 * Every multi-config generator this row accepts — Visual Studio, `Xcode`, `Ninja Multi-Config` —
 * appends the configuration to the output directory, so the artefact is `build/<Config>/<name>` and
 * only the platform's executable suffix differs. That is the layout CMake really produces; the
 * fixture does not redirect it, because a row that asserted a hand-picked output directory would
 * measure the fixture's CMakeLists instead of the generator's behaviour.
 */
export function programPath(build: string, platform: string = process.platform): string {
	return join(build, CONFIGURATION, `${TARGET}${exeSuffix(platform)}`);
}
