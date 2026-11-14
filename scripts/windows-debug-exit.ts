#!/usr/bin/env bun
/**
 * What an adapter's exit status means, as a number, a hex word, and — when it is a loader status —
 * the reason the loader itself would give.
 *
 * A Windows process that cannot load terminates before any of its own code runs, so it writes
 * nothing and leaves an `NTSTATUS` a shell prints as a huge number. Naming it is the difference
 * between "the debugger is broken" and "the install is incomplete".
 */

/** The library a Windows `lldb-dap.exe` loads from its own directory before it can start. */
export const ADAPTER_LIBRARY = "liblldb.dll";

/** The loader statuses worth naming, as unsigned words. */
const LOADER_STATUSES: [number, string][] = [
	[0xc0000135, "the loader could not find a DLL beside it"],
	[0xc0000139, "a DLL beside it is not the version it was linked against"],
	[0xc0000142, "a DLL beside it failed to initialise"],
	[0xc0000005, "it crashed before it could answer"],
];

/** An exit code as a number and a hex word, with the loader's reason when it is one. */
export function describeExit(code: number | null): string {
	if (code === null) return "no exit status";
	const unsigned = code < 0 ? code + 2 ** 32 : code;
	const named = LOADER_STATUSES.find(([value]) => value === unsigned);
	const hex = `0x${unsigned.toString(16)}`;
	return named === undefined ? `${code} (${hex})` : `${code} (${hex}: ${named[1]})`;
}
