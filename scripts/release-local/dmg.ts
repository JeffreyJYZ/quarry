/**
 * The dmg, written from the built bundle without asking Finder for anything.
 *
 * Tauri's own dmg step drives Finder through AppleScript to hide a status bar on the mounted volume;
 * that fails with -10006 whenever Finder is busy, which takes the whole release down. hdiutil copies
 * the folder and converts it, with no Finder and no mount.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { selectDmg } from "../release-manifest";
import { BUNDLE, DMG_DIR } from "./paths";
import { fail, log } from "./process";

/** The dmg the bundler wrote: its name carries the bundle target, so it is found rather than guessed. */
export function dmgPath(version: string): string | null {
	if (!existsSync(DMG_DIR)) return null;
	const candidates = readdirSync(DMG_DIR);
	const { selected, error } = selectDmg(candidates, version);
	if (error !== null) return null;
	return selected === null ? null : join(DMG_DIR, selected);
}

export function makeDmg(version: string): void {
	const app = join(BUNDLE, "quarry.app");
	if (!existsSync(app)) fail(`missing app bundle: ${app}`);
	execFileSync("mkdir", ["-p", DMG_DIR]);
	// The bundle is universal, so the dmg name says so rather than naming one half of it.
	const arch = "universal";
	const target = join(DMG_DIR, `quarry_${version}_${arch}.dmg`);
	execFileSync(
		"hdiutil",
		["create", "-volname", "quarry", "-srcfolder", app, "-ov", "-format", "UDZO", target],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	log(`dmg ${target}`);
}

/** Detaches every mounted quarry volume, so a stray Finder window never survives a release. */
export function detachVolumes(): void {
	const volumes = existsSync("/Volumes") ? readdirSync("/Volumes") : [];
	for (const name of volumes) {
		if (!name.toLowerCase().startsWith("quarry")) continue;
		try {
			execFileSync("hdiutil", ["detach", join("/Volumes", name)], { stdio: "ignore" });
			log(`detached /Volumes/${name}`);
		} catch {
			/* a volume someone is using stays mounted; nothing else to do */
		}
	}
}
