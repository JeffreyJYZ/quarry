/**
 * Child-process plumbing for the C/C++ build-path smoke test.
 *
 * Every child is tracked so the `finally` can kill whatever is still running: a `clang++` that
 * hangs on a half-written file would otherwise outlive the probe.
 */

import { spawn } from "node:child_process";

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

const children: Set<ReturnType<typeof spawn>> = new Set();

export function runChild(
	bin: string,
	args: string[],
	opts: { cwd?: string } = {},
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		children.add(child);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
		child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
		child.on("error", (err) => {
			children.delete(child);
			resolve({ code: null, stdout, stderr: `${stderr}\n[child error: ${err.message}]\n` });
		});
		child.on("exit", (code) => {
			children.delete(child);
			resolve({ code, stdout, stderr });
		});
	});
}

export function killAll(): void {
	for (const child of [...children]) {
		try {
			child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}
	children.clear();
}
