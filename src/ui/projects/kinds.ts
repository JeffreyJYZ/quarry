/** Everything the new-project dialog knows about the kinds it can scaffold. */

export type Kind = "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake";

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

export function defaultStandard(kind: Kind): string {
	return STANDARDS[kind][0].value;
}

/** The directory a new project is created in, with a trailing separator removed. */
export function parentOf(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

export function joinPath(parent: string, name: string): string {
	const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
	return `${parentOf(parent)}${separator}${name.trim()}`;
}
