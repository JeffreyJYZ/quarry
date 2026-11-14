/**
 * Finding the compiler the way the IDE finds it.
 *
 * `xcrun` is the only route to the toolchain a Dock-launched app has, so a bare `clang++` that
 * `PATH` answers is preferred and `xcrun --find` is the fallback.
 */

import { spawnSync } from "node:child_process";

/** The argv the IDE uses for a plain file: no linking, no colour, C++20. */
export const CLANG_ARGS = ["-std=c++20", "-fsyntax-only", "-fno-color-diagnostics"];

export function resolveClang(): string {
	const onPath = spawnSync("clang++", ["--version"], { stdio: "ignore" });
	if (onPath.status === 0) return "clang++";
	const xcrun = spawnSync("xcrun", ["--find", "clang++"], { encoding: "utf8" });
	const found = (xcrun.stdout ?? "").trim().split("\n")[0]?.trim() ?? "";
	if (found) return found;
	return "/usr/bin/clang++";
}
