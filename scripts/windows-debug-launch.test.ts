#!/usr/bin/env bun
/**
 * The three routes to the same program, measured without a Windows machine.
 *
 * Every `lldb-dap.exe` on the image exited the same odd status when the row spawned it directly, so
 * the row now asks through a shell as well. What matters here is that each route produces an argv
 * the shell can actually parse — in particular that the PowerShell script survives quoting untouched,
 * since that is the whole reason it travels encoded.
 */

import { describe, expect, test } from "bun:test";
import { describeWay, encoded, spawnArgs } from "./windows-debug-launch";

const BIN = "C:\\Program Files\\LLVM\\bin\\lldb-dap.exe";

describe("the argument vector each route builds", () => {
	test("direct is the program and its own arguments", () => {
		expect(spawnArgs("direct", BIN, ["--version"])).toEqual([BIN, "--version"]);
	});

	test("cmd gets one command string, quoted so its own parsing stops where we say", () => {
		expect(spawnArgs("cmd", BIN, ["--version"], "C:\\Windows\\System32\\cmd.exe")).toEqual([
			"C:\\Windows\\System32\\cmd.exe",
			"/c",
			`""${BIN}" --version"`,
		]);
	});

	test("powershell receives base64, so no quote can be reinterpreted in transit", () => {
		const argv = spawnArgs("powershell", BIN, ["--version"]);
		expect(argv.slice(0, 4)).toEqual([
			"powershell.exe",
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
		]);
		expect(argv).toHaveLength(5);
		expect(argv[4]).not.toContain('"');
	});

	test("the encoded script runs the program and keeps the child's own status", () => {
		const script = Buffer.from(encoded(BIN, ["--version"]), "base64").toString("utf16le");
		expect(script).toBe(`& '${BIN}' '--version'; exit $LASTEXITCODE`);
	});

	test("a quote inside an argument is doubled, which is how PowerShell escapes it", () => {
		const script = Buffer.from(encoded("x.exe", ["it's"]), "base64").toString("utf16le");
		expect(script).toContain("'it''s'");
	});

	test("each route is named in the log the way the log reader needs", () => {
		expect(describeWay("direct")).toBe("direct");
		expect(describeWay("cmd")).toBe("cmd-shell");
		expect(describeWay("powershell")).toBe("powershell-shell");
	});
});
