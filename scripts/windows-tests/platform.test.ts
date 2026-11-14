/**
 * What each platform's tree promises, measured without either platform.
 *
 * The row's assertions are judged where they run, but the thing that differs between Windows and
 * Linux is a value: the argv CMake is given, the file name a target writes, and the directory it
 * lands in. Those are tested here so a wrong tree is caught on any machine.
 */

import { describe, expect, test } from "bun:test";
import { layoutOf, singleConfigProfile, spell, windowsProfile } from "./platform";

describe("the Windows tree", () => {
	const profile = windowsProfile("Visual Studio 17 2022");

	test("names a multi-config tree and the .exe a link writes", () => {
		expect(profile.configure).toEqual(["-G", "Visual Studio 17 2022", "-A", "x64"]);
		expect(profile.build).toEqual(["--config", "Debug"]);
		expect(profile.configDir).toBe("Debug");
		expect(profile.executable("parity_gtest")).toBe("parity_gtest.exe");
	});

	test("accepts build/Debug/parity_gtest.exe and rejects a bare build/parity_gtest.exe", () => {
		expect(layoutOf("C:\\fixture\\build\\Debug\\parity_gtest.exe", profile).ok).toBe(true);
		expect(layoutOf("C:\\fixture\\build\\parity_gtest.exe", profile).ok).toBe(false);
	});
});

describe("the single-config tree Linux builds", () => {
	const profile = singleConfigProfile("Ninja");

	test("passes no -A and no --config, and writes the target with no suffix", () => {
		expect(profile.configure).toEqual(["-G", "Ninja"]);
		expect(profile.build).toEqual([]);
		expect(profile.configDir).toBeNull();
		expect(profile.executable("parity_gtest")).toBe("parity_gtest");
	});

	test("CMake's default generator passes no -G at all", () => {
		expect(singleConfigProfile(null).configure).toEqual([]);
	});

	test("accepts build/parity_gtest and rejects a configuration directory", () => {
		const layout = layoutOf("/fixture/build/parity_gtest", profile);
		expect(layout.ok).toBe(true);
		expect(layout.detail).toContain("no configuration directory");
		expect(layoutOf("/fixture/build/Debug/parity_gtest", profile).ok).toBe(false);
	});
});

describe("a command as a report line", () => {
	test("quotes the one argument that holds a space", () => {
		expect(
			spell(["cmake", "-S", ".", "-B", "build", "-G", "Visual Studio 17 2022", "-A", "x64"]),
		).toBe('cmake -S . -B build -G "Visual Studio 17 2022" -A x64');
	});

	test("leaves every other argument alone", () => {
		expect(spell(["cmake", "--build", "build"])).toBe("cmake --build build");
	});
});
