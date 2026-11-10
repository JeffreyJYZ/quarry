import { join } from "node:path";

/**
 * The release build is universal, so Tauri writes under the target-specific directory. A bare
 * `target/release` is the arch-only debug leftover, not what a release ships.
 */
export const DEFAULT_TARGET = "universal-apple-darwin";

export function releaseDir(root: string, target: string): string {
	return join(root, "src-tauri", "target", target, "release");
}

export function bundleDir(root: string, target: string): string {
	return join(releaseDir(root, target), "bundle", "macos");
}

/** Whether `lipo -info` reports both halves of the universal release build. */
export function isUniversalBinary(lipoInfo: string): boolean {
	return /\barm64\b/.test(lipoInfo) && /\bx86_64\b/.test(lipoInfo);
}

/** A readable verdict for a `lipo -info` run, or null when the binary carries both architectures. */
export function lipoProblem(output: string | null): string | null {
	if (output === null) return "lipo could not read the binary";
	if (isUniversalBinary(output)) return null;
	return `the binary is not universal: ${output.trim()}`;
}
