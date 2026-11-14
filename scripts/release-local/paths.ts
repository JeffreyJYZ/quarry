/**
 * Where the build writes, and the public URL a release asset serves from.
 */

import { join } from "node:path";
import { REPO, ROOT } from "./process";

/** The release build is universal, so Tauri writes under the target-specific directory. */
export const BUILD_TARGET = "universal-apple-darwin";
export const BUNDLE = join(ROOT, "src-tauri", "target", BUILD_TARGET, "release", "bundle", "macos");
export const ARCHIVE = join(BUNDLE, "quarry.app.tar.gz");
export const ARCHIVE_SIG = `${ARCHIVE}.sig`;
export const DMG_DIR = join(ROOT, "src-tauri", "target", BUILD_TARGET, "release", "bundle", "dmg");
export const RELEASE_DIR = join(ROOT, "dist-release");
export const LATEST = join(RELEASE_DIR, "latest.json");

/** The public URL a release asset serves once the release is published. */
export function assetUrl(tag: string, name: string): string {
	return `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
}
