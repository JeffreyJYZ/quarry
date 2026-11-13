#!/usr/bin/env bun
/**
 * The debug-info reader, measured on the text each tool prints.
 *
 * The Linux branch cannot run on the development machine — readelf is a binutils tool and macOS
 * ships neither it nor an ELF object to hand it — so the marker each platform looks for is pinned
 * here instead. A section table with `.debug_info` is what a RelWithDebInfo object prints on Linux;
 * a Release one lists `.debug_abbrev`-less output with no `.debug_info` at all.
 */

import { expect, test } from "bun:test";
import { readDebugInfo, readerFor } from "./cpp-parity-debug-info";

/** A `readelf -S` section table, trimmed to the sections that decide the answer. */
const READELF_RELWITHDEBINFO = `There are 30 section headers, starting at offset 0x3a58:

Section Headers:
  [Nr] Name             Type            Address          Off    Size   ES Flg Lk Inf Al
  [ 1] .interp          PROGBITS        0000000000000318 000318 00001c 00   A  0   0  1
  [28] .debug_aranges   PROGBITS        0000000000000000 0030c0 000030 00      0   0  1
  [29] .debug_info      PROGBITS        0000000000000000 0030f0 000114 00      0   0  1
  [30] .debug_str       PROGBITS        0000000000000000 003204 0000f7 01  MS  0   0  1
`;

/** The same table for a Release object: optimisation and no `-g`, so no CU section. */
const READELF_RELEASE = `There are 26 section headers, starting at offset 0x31d0:

Section Headers:
  [Nr] Name             Type            Address          Off    Size   ES Flg Lk Inf Al
  [ 1] .interp          PROGBITS        0000000000000318 000318 00001c 00   A  0   0  1
  [26] .comment         PROGBITS        0000000000000000 0000f0 00002c 01  MS  0   0  1
`;

/** `otool -l` output for a Mach-O object compiled with `-g`. */
const OTOOL_RELWITHDEBINFO = `main.cpp.o:
Load command 0
      cmd LC_SEGMENT_64
  segname __DWARF
   nsects 1
Load command 1
      cmd LC_UUID
`;

test("each platform reads the section its object format keeps debug info in", () => {
	expect(readerFor("darwin")?.marker).toBe("__DWARF");
	expect(readerFor("linux")?.marker).toBe(".debug_info");
	expect(readerFor("win32")).toBeNull();
});

test("a Linux object with a compilation unit is read as carrying debug info", async () => {
	const reading = await readDebugInfo(
		"main.cpp.o",
		"build/Release/CMakeFiles/app.dir/main.cpp.o",
		"linux",
		async () => ({
			code: 0,
			stdout: READELF_RELWITHDEBINFO,
			stderr: "",
		}),
	);
	expect(reading.dwarf).toBe(true);
	expect(reading.command).toBe(
		"readelf -S build/Release/CMakeFiles/app.dir/main.cpp.o | rg .debug_info",
	);
});

test("a Linux Release object is read as carrying none", async () => {
	const reading = await readDebugInfo("main.cpp.o", "main.cpp.o", "linux", async () => ({
		code: 0,
		stdout: READELF_RELEASE,
		stderr: "",
	}));
	expect(reading.dwarf).toBe(false);
});

test("macOS still reads its own object through otool", async () => {
	const reading = await readDebugInfo("main.cpp.o", "main.cpp.o", "darwin", async () => ({
		code: 0,
		stdout: OTOOL_RELWITHDEBINFO,
		stderr: "",
	}));
	expect(reading.dwarf).toBe(true);
	expect(reading.command).toBe("otool -l main.cpp.o | rg __DWARF");
});

test("a missing reader names itself instead of answering false", async () => {
	const reading = await readDebugInfo("main.cpp.o", "main.cpp.o", "linux", async () => ({
		code: null,
		stdout: "",
		stderr: "spawn error: ENOENT",
	}));
	expect(reading.dwarf).toBeNull();
	expect(reading.reason).toContain("readelf");
});

test("a platform with no reader at all says so by name", async () => {
	const reading = await readDebugInfo("main.obj", "main.obj", "win32", async () => ({
		code: 0,
		stdout: "",
		stderr: "",
	}));
	expect(reading.dwarf).toBeNull();
	expect(reading.reason).toContain("win32");
});
