/**
 * The two targets the probe measures: a C program built by CMake the way quarry builds one, and a
 * Rust program built by cargo with rustup's formatters loaded.
 *
 * Each target names the expressions the dock would send and the value the UI's default context must
 * produce, so a regression in either language fails the same table.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const C_SOURCE = `#include <stdio.h>

int add(int a, int b) {
	int sum = a + b;
	return sum;
}

int main(void) {
	int total = add(2, 3);
	printf("%d%\\n", total);
	return 0;
}
`;

const C_CMAKE = `cmake_minimum_required(VERSION 3.20)
project(probe C)
add_executable(probe main.c)
`;

const RUST_SOURCE = `use std::hint::black_box;

fn inspect(tag: u8) -> u64 {
	let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef];
	let s: String = String::from("quarry");
	let n: u32 = v.len() as u32;
	black_box((&v, &s, n, tag));
	black_box(n as u64 + tag as u64)
}

fn main() {
	let a = inspect(1);
	black_box(a);
	println!("{a}");
}
`;

export type Target = {
	label: "c" | "rust";
	program: string;
	cwd: string;
	source: string;
	line: number;
	initCommands: string[];
	/** The expressions the dock would send, with the value each must produce under the default context. */
	expressions: Array<{ expression: string; expected: string }>;
	/** Syntax beyond a local, measured once with a frame id; `null` expected value set for all of them. */
	syntax?: string[];
};

export type Outcome = {
	language: string;
	context: string;
	expression: string;
	value: string | null;
	type: string | null;
	message: string | null;
};

export function rustToolchain(): { cargo: string; sysroot: string } {
	const home = process.env.HOME ?? "";
	const cargo = join(home, ".cargo", "bin", "cargo");
	const rustup = "/opt/homebrew/opt/rustup/bin/cargo";
	const cargoBin = Bun.which("cargo") ?? (existsSync(rustup) ? rustup : cargo);
	const sysrootRun = Bun.spawnSync([join(cargoBin, "..", "rustc"), "--print", "sysroot"]);
	const sysroot = sysrootRun.stdout.toString().trim();
	if (sysroot === "") throw new Error("no rustc sysroot");
	return { cargo: cargoBin, sysroot };
}

export async function buildC(): Promise<Target> {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-eval-c-")));
	writeFileSync(join(dir, "main.c"), C_SOURCE);
	writeFileSync(join(dir, "CMakeLists.txt"), C_CMAKE);
	const build = join(dir, "build");
	await Bun.$`cmake -S ${dir} -B ${build} -DCMAKE_BUILD_TYPE=Debug`.quiet();
	await Bun.$`cmake --build ${build}`.quiet();
	return {
		label: "c",
		program: join(build, "probe"),
		cwd: dir,
		source: join(dir, "main.c"),
		// `int sum = a + b;` inside `add`, so `a` and `b` are live.
		line: 4,
		initCommands: [],
		expressions: [
			{ expression: "a", expected: "2" },
			{ expression: "a + b", expected: "5" },
		],
	};
}

export async function buildRust(): Promise<Target> {
	const { cargo, sysroot } = rustToolchain();
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-eval-rust-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "eval-probe"\nversion = "0.1.0"\nedition = "2021"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, RUST_SOURCE);
	const build = Bun.spawnSync([cargo, "build", "--quiet"], {
		cwd: dir,
		env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}` },
	});
	if (build.exitCode !== 0) throw new Error(`cargo build failed:\n${build.stderr.toString()}`);
	const line = RUST_SOURCE.split("\n").findIndex((text) => text.includes("black_box((&v")) + 1;
	return {
		label: "rust",
		program: join(dir, "target", "debug", "eval-probe"),
		cwd: dir,
		source,
		line,
		initCommands: [
			`command script import ${join(sysroot, "lib", "rustlib", "etc", "lldb_lookup.py")}`,
		],
		expressions: [
			{ expression: "n", expected: "4" },
			{ expression: "n + 1", expected: "5" },
			// The rustup formatters are what make this a string rather than a raw struct.
			{ expression: "s", expected: '"quarry"' },
		],
		// lldb's Rust expression parser is a subset: indexing works, a method call and a cast do not.
		syntax: ["v[0]", "v.len()", "tag as u32"],
	};
}
