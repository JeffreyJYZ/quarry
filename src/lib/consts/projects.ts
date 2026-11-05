/** What the new-project dialog can scaffold, and the language standards each kind offers. */

import type { Kind } from "@/ui/projects/kinds";

export const KINDS: { value: Kind; label: string; hint: string }[] = [
	{ value: "rust-bin", label: "Rust binary", hint: "cargo run prints a greeting" },
	{ value: "rust-lib", label: "Rust library", hint: "one function and one passing test" },
	{ value: "c-cmake", label: "C (CMake)", hint: "CMakeLists plus src/main.c" },
	{ value: "cpp-cmake", label: "C++ (CMake)", hint: "CMakeLists plus src/main.cpp" },
];

/** The language standards each kind offers, in the order CLion lists them. */
export const STANDARDS: Record<Kind, { value: string; label: string }[]> = {
	"rust-bin": [
		{ value: "2024", label: "Edition 2024" },
		{ value: "2021", label: "Edition 2021" },
	],
	"rust-lib": [
		{ value: "2024", label: "Edition 2024" },
		{ value: "2021", label: "Edition 2021" },
	],
	"c-cmake": [
		{ value: "17", label: "C17" },
		{ value: "11", label: "C11" },
		{ value: "23", label: "C23" },
	],
	"cpp-cmake": [
		{ value: "20", label: "C++20" },
		{ value: "17", label: "C++17" },
		{ value: "23", label: "C++23" },
	],
};
