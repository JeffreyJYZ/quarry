#!/usr/bin/env bun
/**
 * Detect the external tools the integration probes need.
 *
 * Search order matches the app: PATH first, then /opt/homebrew/bin,
 * /usr/local/bin, ~/.cargo/bin, and `xcrun --find` for Apple tools.
 *
 * Usage:
 *   bun scripts/detect-tools.ts            # required tools; exits 1 if any missing
 *   bun scripts/detect-tools.ts --optional # missing tools are reported but not fatal
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Tool {
	name: string;
	required: boolean;
	/** Apple-only tools resolved through `xcrun --find`. */
	viaXcrun?: boolean;
}

const TOOLS: Tool[] = [
	{ name: "rust-analyzer", required: true },
	{ name: "clangd", required: true },
	{ name: "lldb-dap", required: true, viaXcrun: true },
	{ name: "cmake", required: false },
	{ name: "ninja", required: false },
	{ name: "clang++", required: false, viaXcrun: true },
];

const FALLBACK_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".cargo", "bin")];

function findOnPath(name: string): string | null {
	const pathEnv = process.env.PATH ?? "";
	for (const dir of pathEnv.split(":").filter(Boolean)) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	for (const dir of FALLBACK_DIRS) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function findViaXcrun(name: string): string | null {
	const result = spawnSync("xcrun", ["--find", name], { encoding: "utf8" });
	if (result.status !== 0) return null;
	const found = (result.stdout ?? "").trim().split("\n")[0]?.trim() ?? "";
	return found && existsSync(found) ? found : null;
}

function detect(tool: Tool): string | null {
	if (tool.viaXcrun) {
		const viaXcrun = findViaXcrun(tool.name);
		if (viaXcrun) return viaXcrun;
	}
	return findOnPath(tool.name);
}

const optional = process.argv.includes("--optional");

let missingRequired = false;
for (const tool of TOOLS) {
	const found = detect(tool);
	const status = found ? "present" : "MISSING";
	const req = tool.required ? "required" : "optional";
	console.log(`${tool.name}: ${status}${found ? ` (${found})` : ""} [${req}]`);
	if (!found && tool.required) missingRequired = true;
}

if (missingRequired && !optional) {
	process.exit(1);
}
process.exit(0);
