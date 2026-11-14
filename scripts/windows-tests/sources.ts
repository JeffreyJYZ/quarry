/**
 * The text of the two fixture projects, kept apart from the code that writes them so a file that
 * only builds a fixture is never a file that also decides a verdict.
 *
 * The GoogleTest half needs a binary the dock can ask for `--gtest_list_tests`, and the image ships
 * no gtest package. Fetching googletest through `FetchContent` would add a network dependency and a
 * multi-minute MSVC build to a row that measures the dock, not GoogleTest: quarry never links it —
 * it runs the program with `--gtest_list_tests` and then `--gtest_filter=Suite.Case`. The fixture
 * therefore vendors a header-only runner that emits gtest's own output shape and honours both
 * flags, so the row measures the product's parse, argv and exit handling end to end and stays
 * hermetic.
 */

import { CASE_VALUE, GTEST_CASE, GTEST_SUITE, OTHER_CASE } from "./constants";

/** The `CMakeLists.txt` for both programs: the suite, and one that never answers. */
export const GTEST_CMAKE = `cmake_minimum_required(VERSION 3.20)
project(parity_gtest CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(parity_gtest tests/parity_test.cpp)
target_include_directories(parity_gtest PRIVATE \${CMAKE_CURRENT_SOURCE_DIR})

# Ignored arguments, then a long sleep: the dock asks it for --gtest_list_tests and must kill it.
add_executable(parity_gtest_hang tests/hang.cpp)
`;

/** A GoogleTest-shaped runner: `TEST()` registers a case, both flags behave like gtest's own. */
export const GTEST_SHIM = `#pragma once

// GoogleTest's command-line contract, not GoogleTest. See sources.ts for why this is vendored.
#include <cstdio>
#include <cstring>
#include <vector>

namespace parity_gtest {
struct Case {
	const char* suite;
	const char* name;
	void (*body)();
};

inline std::vector<Case>& cases() {
	static std::vector<Case> all;
	return all;
}

inline int& failures() {
	static int count = 0;
	return count;
}

struct Register {
	Register(const char* suite, const char* name, void (*body)()) {
		cases().push_back({suite, name, body});
	}
};

inline bool wants_list(int argc, char** argv) {
	for (int index = 1; index < argc; ++index) {
		if (std::strcmp(argv[index], "--gtest_list_tests") == 0) return true;
	}
	return false;
}

inline const char* filter(int argc, char** argv) {
	for (int index = 1; index < argc; ++index) {
		if (std::strncmp(argv[index], "--gtest_filter=", 15) == 0) return argv[index] + 15;
	}
	return nullptr;
}

inline int run(int argc, char** argv) {
	if (wants_list(argc, argv)) {
		std::printf("Running main() from gtest_main.cc\\n");
		const char* suite = nullptr;
		for (const Case& entry : cases()) {
			if (suite == nullptr || std::strcmp(suite, entry.suite) != 0) {
				std::printf("%s.\\n", entry.suite);
				suite = entry.suite;
			}
			std::printf("  %s\\n", entry.name);
		}
		return 0;
	}
	const char* wanted = filter(argc, argv);
	int ran = 0;
	for (const Case& entry : cases()) {
		char full[256];
		std::snprintf(full, sizeof full, "%s.%s", entry.suite, entry.name);
		if (wanted != nullptr && std::strcmp(wanted, full) != 0) continue;
		std::printf("[ RUN      ] %s\\n", full);
		const int before = failures();
		entry.body();
		if (failures() == before) std::printf("[       OK ] %s\\n", full);
		else std::printf("[  FAILED  ] %s\\n", full);
		++ran;
	}
	if (ran == 0) return 1;
	return failures() == 0 ? 0 : 1;
}
}  // namespace parity_gtest

#define TEST(Suite, Case)                                            \\
	static void Suite##_##Case##_body();                              \\
	static ::parity_gtest::Register Suite##_##Case##_registration(   \\
		#Suite, #Case, &Suite##_##Case##_body);                       \\
	static void Suite##_##Case##_body()

#define EXPECT_EQ(actual, expected)                                              \\
	do {                                                                         \\
		if (!((actual) == (expected))) {                                         \\
			std::printf("%s:%d: expected %s == %s\\n", __FILE__, __LINE__,         \\
				#actual, #expected);                                             \\
			++::parity_gtest::failures();                                        \\
		}                                                                        \\
	} while (0)
`;

/** The suite's cases: the one the row runs, and a sibling that proves the filter reached the binary. */
export const GTEST_TEST = `#include "gtest/gtest.h"

TEST(${GTEST_SUITE}, ${GTEST_CASE}) {
	const int total = 2 + 3;
	std::printf("parity-case-output total=%d\\n", total);
	EXPECT_EQ(total, ${CASE_VALUE});
}

TEST(${GTEST_SUITE}, ${OTHER_CASE}) {
	std::printf("parity-other-output\\n");
}

int main(int argc, char** argv) {
	return parity_gtest::run(argc, argv);
}
`;

/** A program that ignores its arguments: the dock's 20 s list kill is measured against it. */
export const GTEST_HANG = `#include <chrono>
#include <thread>

int main() {
	std::this_thread::sleep_for(std::chrono::seconds(120));
	return 0;
}
`;

export const CARGO_MANIFEST = `[package]
name = "parity_cargo_tests"
version = "0.0.0"
edition = "2021"
`;

export const CARGO_LIB = `pub fn total() -> i32 {
	2 + 3
}
`;

export const CARGO_TEST_FILE = `#[test]
fn adds_two_and_three() {
	assert_eq!(parity_cargo_tests::total(), 5);
}
`;
