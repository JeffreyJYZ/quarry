#!/usr/bin/env bun
/**
 * How a platform reads DWARF out of a compiled object.
 *
 * The multi-config row proves a configuration reached the compiler by reading the object it wrote,
 * because this linker keeps DWARF in the object and the executable looks the same either way. That
 * read is the one part of the row that is a tool rather than a flag: macOS names the debug segment
 * `__DWARF` in `otool -l`, while ELF keeps it in a `.debug_info` section that `readelf -S` lists.
 *
 * A platform with neither tool is told so by name: a row that cannot read an object must say why,
 * never pass a configuration it did not check.
 */

/** The reader one platform has, and the marker only a debug-info-bearing object prints. */
export interface Reader {
	/** The tool as spawned. */
	program: string;
	/** Its argv for a section dump, without the object. */
	args: string[];
	/** Text that appears only when the object carries a compilation unit's debug info. */
	marker: string;
	/** The same command as a report line, with the object shown as the fixture sees it. */
	command(shown: string): string;
}

const OTOOL: Reader = {
	program: "/usr/bin/otool",
	args: ["-l"],
	marker: "__DWARF",
	command: (shown) => `otool -l ${shown} | rg __DWARF`,
};

/** ELF's reader: `readelf -S` prints the section table, and `.debug_info` is the CU's own section. */
const READELF: Reader = {
	program: "readelf",
	args: ["-S"],
	marker: ".debug_info",
	command: (shown) => `readelf -S ${shown} | rg .debug_info`,
};

/** The reader `platform` has, or null where it has none. */
export function readerFor(platform: string): Reader | null {
	if (platform === "darwin") return OTOOL;
	// Mach-O has no `readelf` and PE carries the debug directory elsewhere; neither row runs there.
	if (platform === "win32") return null;
	return READELF;
}

/** What one object says about its debug info, or why nothing could read it. */
export interface Reading {
	/** The command, in report form; empty when this platform has no reader. */
	command: string;
	/** `true`/`false` as read; null when no tool answered. */
	dwarf: boolean | null;
	/** Why nothing was read, in one clause, when `dwarf` is null. */
	reason: string;
}

/** The runner this module borrows, so it spawns nothing of its own and the probe owns timeouts. */
export type Run = (
	program: string,
	args: string[],
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

/**
 * Read `object`'s debug info the way `platform` records it.
 *
 * `shown` is the path as a report line should spell it, so a reader can run the printed command;
 * `object` is the same file as this process sees it.
 */
export async function readDebugInfo(
	object: string,
	shown: string,
	platform: string,
	run: Run,
): Promise<Reading> {
	const reader = readerFor(platform);
	if (reader === null) {
		return {
			command: "",
			dwarf: null,
			reason: `no DWARF reader for ${platform}: this row reads debug info from the object, and that platform has neither otool nor readelf`,
		};
	}
	const result = await run(reader.program, [...reader.args, object]);
	if (result.code !== 0) {
		return {
			command: reader.command(shown),
			dwarf: null,
			reason: `${reader.program} answered ${result.code ?? "nothing"}: install it, or the configuration's debug info stays unread`,
		};
	}
	return {
		command: reader.command(shown),
		dwarf: result.stdout.includes(reader.marker),
		reason: "",
	};
}
