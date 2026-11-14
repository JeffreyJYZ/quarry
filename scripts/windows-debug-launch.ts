#!/usr/bin/env bun
/**
 * Three ways to start the same program, so "the binary is broken" and "our spawn is broken" are
 * different lines in the log.
 *
 * A Windows image shipped five `lldb-dap.exe` files, and every one of them exited `53 (0x35)` for
 * `--version` — a request that debugs nothing — from two working directories, with `liblldb.dll`
 * beside one of them. Five independent installs do not fail the same way; one spawn path can. So the
 * row asks each candidate through the direct route and through a shell that builds its own command
 * line: `cmd.exe /c` first, because it is the shell the image has, then PowerShell, whose script
 * travels base64-encoded and therefore cannot be re-quoted by anybody.
 */

import { Buffer } from "node:buffer";

/** How a program is started. `direct` is `Bun.spawn`; the others put a shell in between. */
export type Way = "direct" | "cmd" | "powershell";

/** The launch ways in the order they are tried: cheapest first, and the shell only if needed. */
export const WAYS: Way[] = ["direct", "cmd", "powershell"];

/**
 * The argv that starts `bin args` by `way`.
 *
 * `cmd` gets the documented `/c` form for a quoted program: the whole command is one argument,
 * wrapped in an extra pair of quotes, which is how `cmd` is told where its own parsing stops. The
 * PowerShell script is base64 because the argument vector then contains no quotes at all.
 */
export function spawnArgs(
	way: Way,
	bin: string,
	args: string[],
	comspec: string = process.env.ComSpec ?? "cmd.exe",
): string[] {
	if (way === "direct") return [bin, ...args];
	if (way === "cmd") return [comspec, "/c", `""${bin}" ${args.join(" ")}"`];
	return [
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-EncodedCommand",
		encoded(bin, args),
	];
}

/** The PowerShell script that runs `bin args` and exits with the child's own status, encoded. */
export function encoded(bin: string, args: string[]): string {
	const quoted = args.map((arg) => `'${arg.replaceAll("'", "''")}'`).join(" ");
	const script = `& '${bin.replaceAll("'", "''")}' ${quoted}; exit $LASTEXITCODE`;
	return Buffer.from(script, "utf16le").toString("base64");
}

/** A way as the log names it. */
export function describeWay(way: Way): string {
	return way === "direct" ? "direct" : `${way}-shell`;
}
