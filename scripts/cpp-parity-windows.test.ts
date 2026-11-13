#!/usr/bin/env bun
/**
 * The generator discovery the Windows rows rest on, measured without a Windows machine.
 *
 * The rows failed once for trusting a hardcoded generator name, so what is tested here is that the
 * name is read from what cmake lists — including the default generator's `*` and a newer version —
 * and that a wrapped CMake failure keeps enough lines to name its cause.
 */

import { describe, expect, test } from "bun:test";
import { errorLines, toolsetMissing, vsGenerators } from "./cpp-parity-windows";

/** What `cmake --help` prints on the windows-2022 image, newest generator last as cmake orders it. */
const WINDOWS_HELP = `Generators

* Visual Studio 17 2022        = Generates Visual Studio 2022 project files.
                                 Use -A option to specify architecture.
  Visual Studio 16 2019        = Generates Visual Studio 2019 project files.
                                 Use -A option to specify architecture.
  NMake Makefiles              = Generates NMake makefiles.

Generators
`;

/** What a runner that ships a newer Visual Studio lists instead: the older one is absent. */
const NEWER_HELP = `Generators

* Visual Studio 18 2026        = Generates Visual Studio 2026 project files.
                                 Use -A option to specify architecture.
  Ninja                        = Generates build.ninja files.
`;

/** What `cmake --help` prints on a machine with no Visual Studio at all. */
const MACOS_HELP = `Generators

* Unix Makefiles               = Generates standard UNIX makefiles.
  Ninja                        = Generates build.ninja files.
  Xcode                        = Generate Xcode project files.
`;

describe("the Visual Studio generators a machine lists", () => {
	test("read newest first, whatever order cmake prints them in", () => {
		expect(vsGenerators(WINDOWS_HELP)).toEqual([
			"Visual Studio 17 2022",
			"Visual Studio 16 2019",
		]);
	});

	test("a newer generator is found, which is what the hardcoded name missed", () => {
		expect(vsGenerators(NEWER_HELP)).toEqual(["Visual Studio 18 2026"]);
	});

	test("a machine with no Visual Studio generator has none to select", () => {
		expect(vsGenerators(MACOS_HELP)).toEqual([]);
	});

	test("the default-generator marker is not part of the name", () => {
		expect(vsGenerators("* Visual Studio 17 2022 = Generates project files.\n")).toEqual([
			"Visual Studio 17 2022",
		]);
	});
});

describe("a failing configure keeps the lines that name its cause", () => {
	test("a wrapped CMake error keeps more than the first two lines", () => {
		const stderr = [
			"CMake Error at CMakeLists.txt:2 (project):",
			"  Generator",
			"    Visual Studio 17 2022",
			"  could not find any instance of Visual Studio.",
			"",
			"Configuring incomplete, errors occurred!",
		].join("\n");

		expect(errorLines(stderr)).toEqual([
			"CMake Error at CMakeLists.txt:2 (project):",
			"Generator",
			"Visual Studio 17 2022",
			"could not find any instance of Visual Studio.",
			"Configuring incomplete, errors occurred!",
		]);
	});

	test("the first two lines alone hid the cause, which is the bug this row had", () => {
		const stderr = [
			"CMake Error at CMakeLists.txt:2 (project):",
			"  Generator",
			"    Visual Studio 17 2022",
			"  could not find any instance of Visual Studio.",
		].join("\n");
		const twoLines = errorLines(stderr, 2).join(" ");

		expect(toolsetMissing(twoLines)).toBe(false);
		expect(toolsetMissing(stderr)).toBe(true);
	});
});
