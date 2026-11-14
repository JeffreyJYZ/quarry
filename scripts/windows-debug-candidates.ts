#!/usr/bin/env bun
/**
 * Which `lldb-dap` files this machine has, and in what order to try them.
 *
 * The order is the product resolver's own (`src-tauri/src/resolve/windows_llvm.rs` plus
 * `prefer_runnable`): `PATH` as given, then the tool directories with the ones carrying
 * `liblldb.dll` first — a preference, never an exclusion, so a statically linked build still runs.
 * A row that ordered these differently from the app would report an adapter a user never gets.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ADAPTER_LIBRARY } from "./windows-debug-exit";
import { pathEntries, visualStudioLlvmBins } from "./windows-debug-toolchain";

/** One place an adapter could be, and why it is on the list. */
export interface Candidate {
	path: string;
	source: string;
	/** Whether the directory carries the library the adapter loads, which decides the order. */
	loads: boolean;
}

/** The adapter's file name on this platform; `.exe` is the whole difference. */
export function adapterNames(platform: string = process.platform): string[] {
	return platform === "win32" ? ["lldb-dap.exe"] : ["lldb-dap"];
}

/** Every adapter this machine could run, in the product resolver's order. */
export function adapterCandidates(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
	isFile: (path: string) => boolean = existsSync,
): Candidate[] {
	const onPath = pathEntries(environment, platform).map((path) => ({ path, source: "PATH" }));
	const found = [...onPath, ...preferRunnable(windowsDirectories(environment, platform), isFile)];
	const candidates: Candidate[] = [];
	for (const directory of found) {
		for (const name of adapterNames(platform)) {
			const path = join(directory.path, name);
			if (!isFile(path)) continue;
			candidates.push({
				path,
				source: directory.source,
				loads: isFile(join(directory.path, ADAPTER_LIBRARY)),
			});
		}
	}
	return candidates;
}

/** The tool directories with the ones carrying the adapter's library first, order kept otherwise. */
export function preferRunnable<T extends { path: string }>(
	directories: T[],
	isFile: (path: string) => boolean = existsSync,
): T[] {
	const loads = (directory: T) => isFile(join(directory.path, ADAPTER_LIBRARY));
	return [...directories.filter(loads), ...directories.filter((entry) => !loads(entry))];
}

/** The directories the product resolver falls back to on Windows, in its own order. */
export function windowsDirectories(
	environment: Record<string, string | undefined>,
	platform: string = process.platform,
): { path: string; source: string }[] {
	if (platform !== "win32") return [];
	const found: { path: string; source: string }[] = [];
	for (const variable of ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] as const) {
		const root = environment[variable];
		if (root === undefined || root === "") continue;
		found.push({ path: join(root, "LLVM", "bin"), source: `%${variable}%\\LLVM\\bin` });
	}
	const home = environment.USERPROFILE;
	if (home !== undefined && home !== "") {
		found.push({ path: join(home, ".cargo", "bin"), source: "%USERPROFILE%\\.cargo\\bin" });
		found.push({ path: join(home, ".local", "bin"), source: "%USERPROFILE%\\.local\\bin" });
	}
	const local = environment.LOCALAPPDATA;
	if (local !== undefined && local !== "") {
		found.push({
			path: join(local, "Programs", "LLVM", "bin"),
			source: "%LOCALAPPDATA%\\Programs\\LLVM\\bin",
		});
	}
	for (const root of [environment.ProgramFiles, environment.ProgramW6432]) {
		if (root === undefined || root === "") continue;
		for (const bin of visualStudioLlvmBins(root)) {
			found.push({ path: bin, source: "Visual Studio's LLVM" });
		}
	}
	return found;
}

/**
 * The directory a path is in, whichever separator it uses.
 *
 * `dirname` from `node:path` follows the *host*: on a POSIX machine a Windows path is one long file
 * name, so the folder a probe is meant to launch from becomes `.`. A candidate is a Windows path even
 * when the row is being read on macOS, so the split is done by hand.
 */
export function directoryOf(path: string): string {
	const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
	return cut < 0 ? "." : path.slice(0, cut);
}
