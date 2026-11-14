/**
 * Running a command, and the two ways a release says something.
 *
 * Every command runs from the repository root with a pipe on both streams, so a `gh` or `git` that
 * asks a question fails instead of waiting for one.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..", "..");
export const REPO = "JeffreyJYZ/quarry";

export function run(command: string, args: string[], env?: NodeJS.ProcessEnv): string {
	return execFileSync(command, args, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, ...env },
	});
}

export function arg(name: string): string | null {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : (process.argv[index + 1] ?? null);
}

export function log(line: string): void {
	console.log(`release-local  ${line}`);
}

export function fail(message: string): never {
	console.error(`release-local  FAIL  ${message}`);
	process.exit(1);
}
