#!/usr/bin/env bun
/**
 * Single entry point for the integration probes.
 *
 * Runs each probe under scripts/ and prints one line per probe:
 *   PASS  <name>
 *   FAIL  <name>
 *   SKIP  <name> (no tool: <tool>)
 *
 * Exits non-zero only on a real failure (a probe that ran and failed).
 *
 * Usage: bun scripts/integration.ts
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface Probe {
	name: string;
	file: string;
	requires: string[]; // tool names
	/** Probes that need a GUI or debugger permission are never forced. */
	manualOnly?: boolean;
	manualReason?: string;
}

/** How many trailing output lines a failed probe may print, so one probe cannot bury the run. */
const TAIL_LINES = 20;

const PROBES: Probe[] = [
	{ name: "lsp-smoke", file: "lsp-smoke.ts", requires: ["rust-analyzer"] },
	{ name: "lsp-ux-smoke", file: "lsp-ux-smoke.ts", requires: ["rust-analyzer"] },
	{ name: "cxx-smoke", file: "cxx-smoke.ts", requires: ["clang++"] },
	{ name: "lsp-cmake-probe", file: "lsp-cmake-probe.ts", requires: ["clangd", "cmake"] },
	{
		name: "dap-cpp-probe",
		file: "dap-cpp-probe.ts",
		requires: ["lldb-dap", "cmake"],
		manualOnly: true,
		manualReason: "needs DevToolsSecurity enabled",
	},
	{
		name: "dap-eval-probe",
		file: "dap-eval-probe.ts",
		requires: ["lldb-dap"],
		manualOnly: true,
		manualReason: "needs DevToolsSecurity enabled",
	},
	{
		name: "dap-spike",
		file: "dap-spike.ts",
		requires: ["lldb-dap"],
		manualOnly: true,
		manualReason: "needs DevToolsSecurity enabled",
	},
];

function findTool(name: string): string | null {
	const pathEnv = process.env.PATH ?? "";
	const dirs = [
		...pathEnv.split(":").filter(Boolean),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		`${process.env.HOME}/.cargo/bin`,
	];
	for (const dir of dirs) {
		const c = join(dir, name);
		if (existsSync(c)) return c;
	}
	if (name === "lldb-dap" || name === "clang++") {
		const r = spawnSync("xcrun", ["--find", name], { encoding: "utf8" });
		if (r.status === 0) {
			const found = (r.stdout ?? "").trim().split("\n")[0]?.trim() ?? "";
			if (found && existsSync(found)) return found;
		}
	}
	return null;
}

/** One probe run, output captured so a failure can say why. */
function run(probe: Probe) {
	return spawnSync("bun", [join("scripts", probe.file)], {
		stdio: "pipe",
		encoding: "utf8",
	});
}

let failed = false;
for (const probe of PROBES) {
	if (probe.manualOnly) {
		console.log(`SKIP  ${probe.name} (manual-only: ${probe.manualReason})`);
		continue;
	}
	const missing = probe.requires.filter((t) => !findTool(t));
	if (missing.length > 0) {
		console.log(`SKIP  ${probe.name} (no tool: ${missing.join(", ")})`);
		continue;
	}
	let result = run(probe);
	if (result.status !== 0) {
		// These probes index a cold project on a shared runner, and the first run after checkout can
		// outlast a language server's warm-up window. One retry separates that from a real breakage:
		// a probe that is genuinely wrong fails both times.
		console.log(`RETRY ${probe.name}`);
		result = run(probe);
	}
	if (result.status === 0) {
		console.log(`PASS  ${probe.name}`);
	} else {
		console.log(`FAIL  ${probe.name}`);
		// A probe that fails almost always explains itself on stdout, which was dropped here: CI
		// then reported only "FAIL" and no reason. Keep the tail of both streams, bounded so one
		// chatty probe cannot bury the rest of the run.
		for (const stream of [result.stderr, result.stdout]) {
			const lines = (stream ?? "").trim().split("\n").filter(Boolean);
			if (lines.length === 0) continue;
			console.log(lines.slice(-TAIL_LINES).join("\n"));
		}
		failed = true;
	}
}

process.exit(failed ? 1 : 0);
