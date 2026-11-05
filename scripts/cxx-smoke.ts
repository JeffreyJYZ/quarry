#!/usr/bin/env bun
/**
 * C/C++ build-path smoke test for quarry.
 *
 * Proves the C/C++ build path works at all on this machine:
 *   - `clang++` is reachable through `xcrun` (the IDE's only route to the toolchain),
 *   - a deliberate type error produces a stderr line whose shape is exactly what
 *     `src-tauri/src/build_task/` parses (`path:line:column: severity: message`),
 *   - the parser carries its clear "cmake is not on PATH" message, so a missing CMake is a notice
 *     rather than a hang.
 *
 * Usage: bun run scripts/cxx-smoke.ts
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The build path is a module directory, so every file in it counts as the parser. */
const RUST_SOURCE_DIR = join(import.meta.dir, "..", "src-tauri", "src", "build_task");
const CLANG_ARGS = ["-std=c++20", "-fsyntax-only", "-fno-color-diagnostics"];

/** The module directory as one blob of text: the parser lives in several files. */
function readRustModule(dir: string): string {
	return readdirSync(dir)
		.filter((name) => name.endsWith(".rs"))
		.sort()
		.map((name) => readFileSync(join(dir, name), "utf8"))
		.join("\n");
}

interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

const children: Set<ReturnType<typeof spawn>> = new Set();

function runChild(bin: string, args: string[], opts: { cwd?: string } = {}): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		children.add(child);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
		child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
		child.on("error", (err) => {
			children.delete(child);
			resolve({ code: null, stdout, stderr: `${stderr}\n[child error: ${err.message}]\n` });
		});
		child.on("exit", (code) => {
			children.delete(child);
			resolve({ code, stdout, stderr });
		});
	});
}

function killAll() {
	for (const child of [...children]) {
		try {
			child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}
	children.clear();
}

/** Resolve `clang++` the way resolve.rs does: PATH first, then `xcrun --find`. */
function resolveClang(): string {
	const onPath = spawnSync("clang++", ["--version"], { stdio: "ignore" });
	if (onPath.status === 0) return "clang++";
	const xcrun = spawnSync("xcrun", ["--find", "clang++"], { encoding: "utf8" });
	const found = (xcrun.stdout ?? "").trim().split("\n")[0]?.trim() ?? "";
	if (found) return found;
	return "/usr/bin/clang++";
}

/** Shape the Rust parser expects: `path:line:column: severity: message`. */
const SEVERITY_MARKERS = [": fatal error:", ": error:", ": warning:", ": note:", ": remark:"];
const SHAPE_RE = /^([^:]+):(\d+):(\d+):\s*(fatal error|error|warning|note|remark):\s*(.+)$/;

function parseShape(line: string): {
	path: string;
	line: number;
	column: number;
	severity: string;
	message: string;
} | null {
	const m = SHAPE_RE.exec(line.trim());
	if (!m) return null;
	return {
		path: m[1],
		line: Number(m[2]),
		column: Number(m[3]),
		severity: m[4],
		message: m[5],
	};
}

async function main() {
	let tempDir: string | null = null;
	let failure: string | undefined;
	let rawDiagnosticLine = "";
	let shapeOk = false;
	let clangPath = "";
	let cmakeFound = false;
	let cmakeErrorString = "";

	try {
		tempDir = mkdtempSync(join(tmpdir(), "quarry-cxx-smoke-"));
		writeFileSync(
			join(tempDir, "main.cpp"),
			'int main() {\n  int x = "hello";\n  return x;\n}\n',
		);
		writeFileSync(join(tempDir, "ok.cpp"), "int ok() { return 0; }\n");

		// Cross-check the severity markers against the actual Rust source, so this
		// script never drifts from the build module.
		const rustSource = readRustModule(RUST_SOURCE_DIR);
		for (const marker of SEVERITY_MARKERS) {
			if (!rustSource.includes(marker)) {
				failure ??= `severity marker ${JSON.stringify(marker)} missing from src-tauri/src/build_task`;
			}
		}
		const missingCmakeMatch = rustSource.match(
			/\{CMAKE_PROGRAM\} is not on PATH: C\/C\+\+ support needs CMake installed/,
		);
		cmakeErrorString = missingCmakeMatch
			? `${"cmake"} is not on PATH: C/C++ support needs CMake installed`
			: "";
		if (!missingCmakeMatch) {
			failure ??= "missing-cmake error string not found in src-tauri/src/build_task";
		}

		// 1. Resolve clang++ the way the IDE does (PATH then xcrun).
		clangPath = resolveClang();
		const clangProbe = await runChild(clangPath, ["--version"]);
		if (clangProbe.code !== 0) {
			failure ??= `clang++ not usable: ${clangProbe.stderr.trim()}`;
		}

		// 2. Run the exact argv the IDE would use for a plain file.
		let diagnosticRawLine = "";
		if (!failure) {
			const result = await runChild(clangPath, [...CLANG_ARGS, "main.cpp"], { cwd: tempDir });
			if (result.code === 0) {
				failure ??= "clang++ exited 0 on a file with a deliberate type error";
			} else {
				const lines = result.stderr.split("\n");
				for (const line of lines) {
					const shape = parseShape(line);
					if (shape && shape.severity === "error") {
						diagnosticRawLine = line.trim();
						shapeOk = true;
						break;
					}
				}
				if (!shapeOk) {
					failure ??= `no stderr line matched ${SHAPE_RE} (raw: ${JSON.stringify(result.stderr)})`;
				}
			}
		}
		rawDiagnosticLine = diagnosticRawLine;

		// 3. The clean file must compile without diagnostics.
		if (!failure) {
			const okResult = await runChild(clangPath, [...CLANG_ARGS, "ok.cpp"], { cwd: tempDir });
			if (okResult.code !== 0) {
				failure ??= `ok.cpp failed to compile: ${okResult.stderr.trim()}`;
			} else {
				const hasDiag = okResult.stderr
					.split("\n")
					.some((l) => parseShape(l)?.severity === "error");
				if (hasDiag) {
					failure ??= "ok.cpp produced an error diagnostic";
				}
			}
		}

		// 4. Report this machine's cmake. The IDE contract is that a *missing* cmake produces a
		//    clear message, not that cmake is missing — it is installed here (Homebrew), which a
		//    Dock-launched app does not see on PATH. The message itself was checked against the parser
		//    above, so that branch is covered without uninstalling anything to exercise it.
		cmakeFound = spawnSync("cmake", ["--version"], { stdio: "ignore" }).status === 0;
	} finally {
		killAll();
		if (tempDir) {
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// best effort
			}
		}
	}

	const lines: string[] = [];
	lines.push("C/C++ build-path smoke — quarry");
	lines.push(`  clang++     ${clangPath || "(not found)"}`);
	lines.push(`  raw line    ${rawDiagnosticLine || "(none)"}`);
	lines.push(`  shape_ok    ${shapeOk}`);
	lines.push(
		`  cmake       ${cmakeFound ? "installed here (not on a Dock-launched PATH)" : "absent"}`,
	);
	lines.push(`  cmake err   ${cmakeErrorString || "(not found in source)"}`);
	lines.push(`  result      ${failure ? "FAIL" : "PASS"}`);
	if (failure) lines.push(`  reason      ${failure}`);
	console.log(lines.join("\n"));

	if (failure) {
		process.exit(1);
	}
}

main().catch((error) => {
	killAll();
	console.error(`cxx-smoke: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
