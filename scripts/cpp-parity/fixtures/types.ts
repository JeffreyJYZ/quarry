/**
 * Fixture projects for the C/C++ parity probe, each one a shape a CLion C/C++ user actually has.
 *
 * Every fixture is a real CMake project with a real build directory, laid out the way CLion lays one
 * out: a `CMakePresets.json` with its own `binaryDir`, a toolchain file named by a preset cache
 * variable, a library plus an app that includes the library by a build-system-only path, a project
 * CLion configured into `cmake-build-debug/`, and a file that uses standard headers through the
 * compiler CMake chose.
 *
 * The probe writes these into a temp directory, builds each one the way CLion would, then asks what
 * quarry does with the same tree. Nothing here is a toy: every source file compiles with the flags
 * its build directory records, and its analysis position needs those flags.
 */

/** One position in one file that only a build-aware language server can answer. */
export interface AnalysisProbe {
	/** Path inside the fixture. */
	file: string;
	/** Text to point at; the probe hovers the first occurrence. */
	needle: string;
	/** What the position needs from the compile command, for the findings. */
	needs: string;
	/**
	 * Text a correct hover must contain. This is the standard the analysis is judged against: the
	 * fixture's own build guarantees it, so a hover that lacks it is analysing other flags.
	 */
	expect: string;
}

export interface Fixture {
	/** Directory name under the probe's temp root, and the table's capability label. */
	name: string;
	/**
	 * The CMake generator this fixture's own build uses, when it is not the platform default.
	 *
	 * A Windows row cannot name a version up front: the runner's images move, and the generator that
	 * exists there is discovered, so it is carried on the fixture rather than hardcoded in the row.
	 */
	generator?: string;
	/** Relative path to file contents. */
	files: Record<string, string>;
	/**
	 * `"cmake"` for a project with a build system (the default), `"plain"` for one quarry compiles
	 * itself: the latter has no manifest, no database and no build of its own to borrow flags from.
	 */
	kind?: "cmake" | "plain";
	/** The build a CLion user's project already has, argv arrays run in order. */
	userBuild?: string[][];
	/** Where that build writes `compile_commands.json`, relative to the fixture root. */
	userDb?: string;
	/**
	 * True when this fixture's whole point is that the build may record no database (a generator that
	 * ignores `CMAKE_EXPORT_COMPILE_COMMANDS`), so a missing one is a finding, not a broken fixture.
	 */
	dbOptional?: boolean;
	/** A plain project's own build, argv arrays run in order: its proof that its sources compile. */
	plainBuild?: string[][];
	/** Files that must be executable, relative to the fixture root: a launcher script, for one. */
	executables?: string[];
	/** Positions the analysis is judged at. */
	probes: AnalysisProbe[];
}

/** The two lines every fixture manifest opens with. */
export function cmakeHeader(project: string): string {
	return `cmake_minimum_required(VERSION 3.20)\nproject(${project} CXX)\n`;
}
