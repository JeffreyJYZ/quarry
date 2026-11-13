#!/usr/bin/env bun
/**
 * The second toolchain the `toolchain: gcc` parity row is measured with: where a Homebrew GCC
 * lives, and the plumbing the row is judged through.
 *
 * Discovery is separate from judging because it is also what lets the row be skipped by name: a
 * machine without a GCC compiler is told so in one line, and every other row still runs.
 */

import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { Fixture } from "./cpp-parity-fixtures";
import type { Measurement, Plan, RunResult } from "./cpp-parity-probe";

/** How this platform installs a second toolchain, so a skip names a command that works there. */
const INSTALL =
	process.platform === "darwin"
		? "brew install gcc"
		: process.platform === "win32"
			? "install GCC, for instance through MSYS2"
			: "apt install g++";

/** Why a machine without a second toolchain is skipped, in the words that fix it. */
export const NO_GCC = `no GCC compiler found (install one with \`${INSTALL}\`)`;

/** The PATH of the machine the probe was started on, before the install dirs below. */
const PATH = (process.env.PATH ?? "").split(delimiter).filter(Boolean);

/** The compiler pair a second toolchain is made of, and the version it reported. */
export interface GccToolchain {
	cxx: string;
	cc: string;
	version: string;
}

/** The product's plan, and the probe's own process and clangd plumbing. */
export interface GccHarness {
	ask(flags?: { profile?: string; target?: string }): Promise<Plan>;
	run(bin: string, args: string[], cwd: string): Promise<RunResult>;
	analyse(probes: Fixture["probes"], args: string[]): Promise<Measurement[]>;
	compileArguments(database: string, source: string): string[] | null;
	commandLine(argv: string[]): string;
	firstError(text: string): string;
	isFile(path: string): boolean;
	writeFixture(): void;
	/**
	 * Whether the row's control must discriminate: the same clangd with no `--query-driver` failing
	 * to read GCC's standard header. That holds where clang and GCC keep different C++ standard
	 * libraries (macOS: libc++ against libstdc++). On a platform where both use libstdc++, clangd
	 * finds those headers by itself, so the control is evidence instead of a requirement — the same
	 * way the MSVC row reports its control.
	 */
	requiresDriverControl: boolean;
}

/** Where a Homebrew GCC lives, before PATH: a GUI launch does not search these. */
const DIRS = ["/opt/homebrew/opt/gcc/bin", "/opt/homebrew/bin", "/usr/local/bin"];

/**
 * The newest GCC compiler in `dirs`, then PATH, or null.
 *
 * The vendor is the test, not the name: `/usr/bin/g++` is Apple clang wearing GCC's name, and
 * handing clangd that driver would prove nothing about a second toolchain.
 *
 * `dirs` is a seam for the probe's own test, so the skip path can be measured on a machine that has
 * a GCC — which is exactly the machine that never exercises it.
 */
export function findGcc(dirs: string[] = [...DIRS, ...PATH]): GccToolchain | null {
	const found: { cxx: string; version: number }[] = [];
	for (const dir of dirs) {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const match = /^g\+\+(-(\d+))?$/.exec(entry);
			if (match !== null)
				found.push({ cxx: join(dir, entry), version: Number(match[2] ?? 0) });
		}
	}
	found.sort((one, other) => other.version - one.version);
	for (const candidate of found) {
		const reported = Bun.spawnSync([candidate.cxx, "--version"]);
		if (reported.exitCode !== 0) continue;
		const text = reported.stdout.toString();
		if (!text.includes("Free Software Foundation")) continue;
		const cc = candidate.cxx.replace(/g\+\+/, "gcc");
		if (!existsSync(cc)) continue;
		const line = text.split("\n").find((row) => row.trim() !== "") ?? "";
		return { cxx: candidate.cxx, cc, version: line.trim() };
	}
	return null;
}
