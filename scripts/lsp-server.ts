/**
 * Finding a language server and shaping the `PATH` it runs with.
 *
 * Both rust-analyzer probes were carrying identical copies of this: the binary is looked for on
 * `PATH` first and then in the directories a Dock-launched app cannot see, and the child's `PATH`
 * puts those directories first so a server that shells out finds its own toolchain.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Directories a GUI launch does not have on `PATH`, in the order the product searches them. */
export const FALLBACK_DIRS = [
	"/opt/homebrew/opt/rustup/bin",
	"/opt/homebrew/bin",
	"/usr/local/bin",
	`${process.env.HOME}/.cargo/bin`,
];

/** Resolve `rust-analyzer` the way detect-tools does: PATH first, then the usual install dirs. */
export function findServerBinary(): string {
	const dirs = [...(process.env.PATH ?? "").split(":").filter(Boolean), ...FALLBACK_DIRS];
	for (const dir of dirs) {
		const candidate = join(dir, "rust-analyzer");
		if (existsSync(candidate)) return candidate;
	}
	return "rust-analyzer";
}

/** The prefix list `server_path` in `src-tauri/src/lsp.rs` builds, in the same order. */
export function serverPath(binary: string): string {
	const dirs = [
		dirname(binary),
		"/opt/homebrew/opt/rustup/bin",
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
	];
	const inherited = (process.env.PATH ?? "").split(":").filter(Boolean);
	return [...dirs, ...inherited].join(":");
}
