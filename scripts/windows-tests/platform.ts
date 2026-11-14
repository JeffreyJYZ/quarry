/**
 * What each platform's build writes, and how to ask CMake for it.
 *
 * The row asserts the same things everywhere; only the tree CMake writes differs. Each difference is
 * a value here rather than a branch inside an assertion, so both reports stay the same measurement
 * of the dock:
 *
 *   windows  a multi-config Visual Studio tree — `-G <generator> -A x64`, `--config Debug`, and
 *            `<Config>\<target>.exe`
 *   linux    a single-config tree — no `-A`, no `--config`, no `<Config>` directory at all, and
 *            `build/<target>` with no suffix, because the artefact is ELF and carries no `.exe`
 */

import { join } from "node:path";
import { errorLines, run, writeConfigureProbe } from "./tools";

/** How one platform's CMake tree is spelled on a command line and on disk. */
export interface Profile {
	/** The generator, or null to let CMake choose its default. */
	generator: string | null;
	/** Arguments after `-S <root> -B <build>`. */
	configure: string[];
	/** Arguments after `--build <build>`. */
	build: string[];
	/** The configuration subtree the generator writes, or null when the tree is single-config. */
	configDir: string | null;
	/** The file a CMake target named `target` writes on this platform. */
	executable(target: string): string;
	/** One line naming what this platform's tree looks like. */
	facts: string;
}

/** The multi-config Visual Studio tree the Windows row measures. */
export function windowsProfile(generator: string): Profile {
	return {
		generator,
		configure: ["-G", generator, "-A", "x64"],
		build: ["--config", "Debug"],
		configDir: "Debug",
		executable: (target) => `${target}.exe`,
		facts: "multi-config tree: <Config>\\<target>.exe, built with --config Debug",
	};
}

/** The single-config tree Linux builds, with the generator this machine proved it has. */
export function singleConfigProfile(generator: string | null): Profile {
	return {
		generator,
		configure: generator === null ? [] : ["-G", generator],
		build: [],
		configDir: null,
		executable: (target) => target,
		facts:
			generator === null
				? "single-config tree: build/<target>, no .exe, no <Config> directory, CMake's default generator"
				: `single-config tree: build/<target>, no .exe, no <Config> directory, generator ${generator}`,
	};
}

/** The generators a POSIX cmake almost always has, preferred in this order; null means its default. */
export const SINGLE_CONFIG_GENERATORS: (string | null)[] = ["Ninja", "Unix Makefiles", null];

/** A generator proved by configuring, not by being listed. */
export interface SingleConfigSearch {
	profile: Profile | null;
	attempts: string[];
}

/**
 * The first single-config generator this machine can configure with.
 *
 * Ninja is CLion's own default and CMake's default is whatever the image was built with, so the
 * choice is measured: each candidate configures a minimal project and the first success is the
 * profile. A machine that configures with none is a machine with no C++ toolchain, which the caller
 * reports as a SKIP naming every attempt rather than guessing a generator.
 */
export async function detectSingleConfig(
	cmake: string,
	scratch: string,
): Promise<SingleConfigSearch> {
	const attempts: string[] = [];
	for (const generator of SINGLE_CONFIG_GENERATORS) {
		const label = generator ?? "cmake default";
		const root = join(scratch, `probe-${label.replace(/[^A-Za-z0-9]+/g, "-")}`);
		writeConfigureProbe(root);
		const args = [
			"-S",
			root,
			"-B",
			join(root, "build"),
			...(generator === null ? [] : ["-G", generator]),
		];
		const result = await run(cmake, args, root, 180_000);
		if (result.code === 0) {
			attempts.push(`${label}: configured`);
			return { profile: singleConfigProfile(generator), attempts };
		}
		attempts.push(`${label}: ${errorLines(result.stderr)[0] ?? `exited ${result.code}`}`);
	}
	return { profile: null, attempts };
}

/** One command as a report line: an argument holding a space is quoted, as a shell would need. */
export function spell(parts: string[]): string {
	return parts.map((part) => (/[\s"]/.test(part) ? `"${part}"` : part)).join(" ");
}

/**
 * Where the built artefact sits, as this platform's tree says it should.
 *
 * Windows puts it in `<Config>`, a single-config generator straight into the build directory. A
 * layout the profile did not predict makes every later assertion measure the wrong file, so the row
 * stops there instead of passing on a program at a path no launch file names.
 */
export function layoutOf(program: string, profile: Profile): { ok: boolean; detail: string } {
	// Split on both separators: the Windows row's paths are judged on a machine whose own path
	// module may use `/`, and the tree's shape is what is under test, not the host's spelling.
	const parts = program.split(/[\\/]+/).filter((part) => part !== "");
	const held = parts[parts.length - 2] ?? "";
	const file = parts[parts.length - 1] ?? "";
	const wanted = profile.configDir ?? "build";
	if (held !== wanted) {
		return { ok: false, detail: `found ${held}/${file}, expected ${wanted}/` };
	}
	const shape = profile.configDir === null ? ", no configuration directory" : "";
	return { ok: true, detail: `${wanted}/${file}${shape}` };
}
