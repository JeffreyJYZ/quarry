/**
 * Spawning what the product would spawn, and finding the tools it looks for.
 *
 * A tool is found the way quarry's own `resolve` finds one — PATH first, then the install dirs a
 * Dock-launched app lacks — so the probe measures the product's search rather than a shell that
 * happens to carry Homebrew on PATH.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { RunResult } from "./types";

export function run(
	bin: string,
	args: string[],
	cwd: string,
	timeout = 120_000,
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (code: number | null, note = "") => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, stdout, stderr: stderr + note });
		};
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			finish(null, `\n[timed out after ${timeout}ms]\n`);
		}, timeout);
		child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
		child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
		child.on("error", (error) => finish(null, `\n[spawn error: ${error.message}]\n`));
		child.on("exit", (code) => finish(code));
	});
}

/** A tool the way quarry's `resolve` finds one: PATH first, then the install dirs a GUI launch lacks. */
export function findTool(name: string): string | null {
	const windows = process.platform === "win32";
	const apple = process.platform === "darwin";
	const files = windows ? [name, `${name}.exe`] : [name];
	const dirs = [
		...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
		// Homebrew's two prefixes are the dirs a Dock-launched app lacks; Linux keeps everything the
		// app needs on PATH, and stat-ing macOS paths there is a lookup that cannot answer.
		...(apple ? ["/opt/homebrew/bin", "/usr/local/bin"] : []),
		`${process.env.HOME}/.cargo/bin`,
	];
	for (const dir of dirs) {
		for (const file of files) {
			const candidate = join(dir, file);
			if (existsSync(candidate)) return candidate;
		}
	}
	// `xcrun` is Apple's; asking for it on another platform is a wasted spawn, not a fallback.
	if (apple && (name === "clangd" || name === "cargo")) {
		const xcrun = Bun.spawnSync(["xcrun", "--find", name]);
		const found = xcrun.stdout.toString().trim();
		if (found && existsSync(found)) return found;
	}
	return null;
}

/** The PATH a language server is started with: its own dir, the install dirs, then what we have. */
export function serverPath(binary: string): string {
	const inherited = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	const apple = process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : [];
	const posix = process.platform === "win32" ? [] : ["/usr/bin"];
	return [dirname(binary), ...apple, ...posix, ...inherited].join(delimiter);
}

export function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}
