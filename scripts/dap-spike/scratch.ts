/**
 * The throwaway cargo project, built before the adapter is started.
 *
 * `mktemp` gives `/var/folders/...`, which is a symlink to `/private/var/folders/...`; lldb
 * canonicalises the DWARF source path, so the project is built under the real path or every
 * breakpoint stays unverified.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARGO_GUESS, MAIN_RS } from "./constants";
import type { Scratch } from "./state";

function cargoBinary(): string {
	const probe = spawnSync("cargo", ["--version"], { encoding: "utf8" });
	if (probe.status === 0) return "cargo";
	return CARGO_GUESS;
}

export function makeScratch(forcedDir?: string): Scratch {
	// mktemp gives /var/folders/... which is a symlink to /private/var/folders/...
	// lldb canonicalises the DWARF source path, so build under the real path or
	// every breakpoint stays unverified.
	const dir = realpathSync(forcedDir ?? mkdtempSync(join(tmpdir(), "quarry-dap-spike-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "dap-spike"\nversion = "0.1.0"\nedition = "2021"\n\n[[bin]]\nname = "dap-spike"\npath = "src/main.rs"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, MAIN_RS);

	const lines = MAIN_RS.split("\n");
	const breakpointLine = lines.findIndex((l) => l.includes("black_box((&v")) + 1;
	if (breakpointLine < 1) throw new Error("breakpoint marker missing from generated main.rs");

	const cargo = cargoBinary();
	const build = spawnSync(cargo, ["build", "--quiet"], {
		cwd: dir,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}`,
		},
	});
	if (build.status !== 0) {
		throw new Error(`cargo build failed (${cargo}):\n${build.stderr || build.stdout}`);
	}
	const binary = join(dir, "target", "debug", "dap-spike");
	readFileSync(binary); // throws if the artifact is missing
	return { dir, binary, source, breakpointLine };
}
