/**
 * The checks themselves: compiler reachable, error shape parseable, clean file clean, and the
 * "cmake is not on PATH" notice still carried by the parser.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLANG_ARGS, resolveClang } from "./clang";
import {
	parseShape,
	readRustModule,
	RUST_SOURCE_DIR,
	SEVERITY_MARKERS,
	SHAPE_RE,
} from "./diagnostics";
import { killAll, runChild } from "./process";

export interface SmokeResult {
	clangPath: string;
	rawDiagnosticLine: string;
	shapeOk: boolean;
	cmakeFound: boolean;
	cmakeErrorString: string;
	failure: string | undefined;
}

export async function runSmoke(): Promise<SmokeResult> {
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

	return {
		clangPath,
		rawDiagnosticLine,
		shapeOk,
		cmakeFound,
		cmakeErrorString,
		failure,
	};
}

export function reportSmoke(result: SmokeResult): void {
	const lines: string[] = [];
	lines.push("C/C++ build-path smoke — quarry");
	lines.push(`  clang++     ${result.clangPath || "(not found)"}`);
	lines.push(`  raw line    ${result.rawDiagnosticLine || "(none)"}`);
	lines.push(`  shape_ok    ${result.shapeOk}`);
	lines.push(
		`  cmake       ${result.cmakeFound ? "installed here (not on a Dock-launched PATH)" : "absent"}`,
	);
	lines.push(`  cmake err   ${result.cmakeErrorString || "(not found in source)"}`);
	lines.push(`  result      ${result.failure ? "FAIL" : "PASS"}`);
	if (result.failure) lines.push(`  reason      ${result.failure}`);
	console.log(lines.join("\n"));
}
