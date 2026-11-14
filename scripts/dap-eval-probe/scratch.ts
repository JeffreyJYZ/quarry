/**
 * The throwaway cargo project and the toolchain paths the adapter needs.
 *
 * Every breakpoint here depends on the source path the compiler recorded matching the one the probe
 * sends, so the temp directory is realpath'd before anything is built.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CARGO_GUESS = "/opt/homebrew/opt/rustup/bin/cargo";

/** The bytes `MAIN_RS` puts in the `Vec`, and what `readMemory` must return from the pointer. */
export const KNOWN_BYTES = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];

export const MAIN_RS = `use std::hint::black_box;

static mut COUNTER: u32 = 0;

fn inspect(tag: u8) -> u64 {
    let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
    let s: String = String::from("quarry");
    let o: Option<u32> = Some(1234);
    let raw: *const u8 = v.as_ptr();
    let n: u32 = v.len() as u32;
    unsafe { COUNTER += n; }
    black_box((&v, &s, &o, raw, n, tag));
    let sum = black_box(unsafe { *raw } as u64 + n as u64 + tag as u64);
    sum
}

fn main() {
    let a = inspect(1);
    let b = inspect(2);
    black_box(a + b);
    println!("{a} {b}");
}
`;

export interface Scratch {
	dir: string;
	binary: string;
	source: string;
	breakpointLine: number;
}

export function cargoBinary(): string {
	const p = spawnSync("cargo", ["--version"], { encoding: "utf8" });
	if (p.status === 0) return "cargo";
	return CARGO_GUESS;
}

export function makeScratch(): Scratch {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-dap-eval-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "dap-spike"\nversion = "0.1.0"\nedition = "2021"\n\n[[bin]]\nname = "dap-spike"\npath = "src/main.rs"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, MAIN_RS);
	const lines = MAIN_RS.split("\n");
	const breakpointLine = lines.findIndex((l) => l.includes("black_box((&v")) + 1;
	const cargo = cargoBinary();
	const build = spawnSync(cargo, ["build", "--quiet"], {
		cwd: dir,
		encoding: "utf8",
		env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}` },
	});
	if (build.status !== 0) throw new Error(`cargo build failed:\n${build.stderr || build.stdout}`);
	const binary = join(dir, "target", "debug", "dap-spike");
	readFileSync(binary);
	return { dir, binary, source, breakpointLine };
}

export function sysroot(): string {
	let s = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" }).stdout?.trim() ?? "";
	if (!s)
		s =
			spawnSync("/opt/homebrew/opt/rustup/bin/rustc", ["--print", "sysroot"], {
				encoding: "utf8",
			}).stdout?.trim() ?? "";
	return s;
}
