#!/usr/bin/env bun
/**
 * clangd hand-off probe for a CMake C/C++ project.
 *
 * Builds a real CMake project in a temp directory — a local header under `include/` and an `extern`
 * declaration the header promises — and measures the two halves separately:
 *
 *   before  clangd started in the project root with no arguments, which is what an analyser that
 *           cannot find the database does: the build tree here is CLion's `cmake-build-debug/`,
 *           a directory clangd does not search (it does search `build/`), so the header is
 *           unresolved and the extern symbol unknown;
 *   after   clangd started with the directory of the compile database and the compiler to query,
 *           which is what `lsp/handoff` hands it: no error diagnostics, and the extern declaration
 *           hovers as the type the header gives it.
 *
 * The flag names are read back from the Rust source, so the probe cannot drift from the hand-off it
 * tests. `cmake --build` runs first: code the build rejects is not the case being proven.
 *
 * Usage: bun run scripts/lsp-cmake-probe.ts
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HANDOFF = join(ROOT, "src-tauri", "src", "lsp", "handoff");

const CMAKE_LISTS = `cmake_minimum_required(VERSION 3.20)
project(teacher_demo CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(demo src/main.cpp src/mathx.cpp)
target_include_directories(demo PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)
`;

const HEADER = `#pragma once

extern int mathx_counter;
int mathx_double(int value);
`;

const LIBRARY = `#include <mathx.hpp>

int mathx_counter = 0;

int mathx_double(int value) { return value * 2; }
`;

const MAIN = `#include <cstdio>

#include <mathx.hpp>

int main() {
    mathx_counter = 2;
    std::printf("%d\\n", mathx_double(mathx_counter));
    return 0;
}
`;

type Json = Record<string, unknown>;

/** Percent-encode a path into a `file://` URI, one byte at a time. */
function fileUri(path: string): string {
	let uri = "file://";
	for (const byte of Buffer.from(path, "utf8")) {
		const plain =
			(byte >= 0x41 && byte <= 0x5a) ||
			(byte >= 0x61 && byte <= 0x7a) ||
			(byte >= 0x30 && byte <= 0x39) ||
			byte === 0x2d ||
			byte === 0x2e ||
			byte === 0x5f ||
			byte === 0x7e ||
			byte === 0x2f;
		uri += plain
			? String.fromCharCode(byte)
			: `%${byte.toString(16).padStart(2, "0").toUpperCase()}`;
	}
	return uri;
}

/** One clangd process, framed, with everything it said kept for diagnosis. */
class Server {
	readonly responses: Json[] = [];
	readonly notifications: Json[] = [];
	stderr = "";
	private child: ChildProcess;
	private buffer = Buffer.alloc(0);

	constructor(binary: string, cwd: string, args: string[]) {
		this.child = spawn(binary, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
		this.child.stdout?.on("data", (chunk: Buffer) => this.onData(chunk));
		this.child.stderr?.on("data", (chunk: Buffer) => {
			this.stderr += chunk.toString("utf8");
		});
		this.child.on("error", (error) => {
			this.stderr += `\n[child error: ${error.message}]\n`;
		});
	}

	send(message: Json) {
		const body = JSON.stringify(message);
		this.child.stdin?.write(
			`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
		);
	}

	kill() {
		try {
			this.child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}

	private onData(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const end = this.buffer.indexOf("\r\n\r\n");
			if (end < 0) return;
			const header = this.buffer.subarray(0, end).toString("ascii");
			const match = /Content-Length:\s*(\d+)/i.exec(header);
			if (!match) return;
			const length = Number(match[1]);
			const start = end + 4;
			if (this.buffer.length < start + length) return;
			const raw = this.buffer.subarray(start, start + length).toString("utf8");
			this.buffer = this.buffer.subarray(start + length);
			try {
				const message = JSON.parse(raw) as Json;
				if (message.method === undefined) this.responses.push(message);
				else this.notifications.push(message);
			} catch {
				this.stderr += `\n[unparseable payload: ${raw.slice(0, 200)}]\n`;
			}
		}
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How many errors clangd last published for `uri`. */
function errorsFor(server: Server, uri: string): Json[] {
	const published = server.notifications.filter(
		(note) => note.method === "textDocument/publishDiagnostics",
	);
	const own = published.filter((note) => (note.params as Json | undefined)?.uri === uri);
	const last = own.at(-1)?.params as { diagnostics?: Json[] } | undefined;
	return (last?.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === 1);
}

function summary(reported: Json[]): string {
	if (reported.length === 0) return "clean";
	return reported.map((diagnostic) => String(diagnostic.message ?? "")).join(" | ");
}

/** One analysis run: initialize, open the file, wait for diagnostics and one hover. */
async function analyse(
	binary: string,
	project: string,
	args: string[],
	source: string,
	uri: string,
) {
	const server = new Server(binary, project, args);
	try {
		const rootUri = fileUri(project);
		server.send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				processId: process.pid,
				rootUri,
				capabilities: {
					textDocument: { hover: { contentFormat: ["markdown", "plaintext"] } },
				},
				workspaceFolders: [{ uri: rootUri, name: "teacher_demo" }],
			},
		});
		const ready = Date.now() + 20_000;
		while (Date.now() < ready && !server.responses.some((response) => response.id === 1)) {
			await sleep(50);
		}
		if (!server.responses.some((response) => response.id === 1)) {
			return { errors: -1, said: "no initialize response", hover: "", stderr: server.stderr };
		}

		server.send({ jsonrpc: "2.0", method: "initialized", params: {} });
		server.send({
			jsonrpc: "2.0",
			method: "textDocument/didOpen",
			params: {
				textDocument: {
					uri,
					languageId: "cpp",
					version: 1,
					text: readFileSync(source, "utf8"),
				},
			},
		});

		const published = Date.now() + 20_000;
		while (
			Date.now() < published &&
			!server.notifications.some((note) => note.method === "textDocument/publishDiagnostics")
		) {
			await sleep(50);
		}
		// A second publish follows the first once the preamble has been parsed.
		await sleep(1_200);

		const text = readFileSync(source, "utf8");
		const texts = text.split("\n");
		const line = texts.findIndex((entry) => entry.includes("mathx_counter = 2"));
		const character = (texts[line] ?? "").indexOf("mathx_counter");
		server.send({
			jsonrpc: "2.0",
			id: 2,
			method: "textDocument/hover",
			params: { textDocument: { uri }, position: { line, character } },
		});
		const hovered = Date.now() + 15_000;
		while (Date.now() < hovered && !server.responses.some((response) => response.id === 2)) {
			await sleep(50);
		}
		const hover = server.responses.find((response) => response.id === 2)?.result;
		const reported = errorsFor(server, uri);
		return {
			errors: reported.length,
			said: summary(reported),
			hover: JSON.stringify(hover ?? null),
			stderr: server.stderr,
		};
	} finally {
		server.kill();
	}
}

/** The flag names must be the ones the product composes. */
function productFlags(): { dir: string; driver: string } {
	const compose = readFileSync(join(HANDOFF, "compose.rs"), "utf8");
	const flag = (name: string): string => {
		const match = new RegExp(`pub const ${name}: &str = "(--[a-z-]+)";`).exec(compose);
		if (match === null)
			throw new Error(`${name} is not declared in src/lsp/handoff/compose.rs`);
		return match[1];
	};
	return { dir: flag("COMPILE_COMMANDS_DIR"), driver: flag("QUERY_DRIVER") };
}

async function main() {
	let project: string | null = null;
	const lines: string[] = ["clangd CMake hand-off — quarry"];
	const failures: string[] = [];

	try {
		if (spawnSync("clangd", ["--version"], { stdio: "ignore" }).status !== 0) {
			throw new Error("clangd is not on PATH");
		}
		const flags = productFlags();
		lines.push(`  flags       ${flags.dir} ${flags.driver} (from src/lsp/handoff/compose.rs)`);

		project = mkdtempSync(join(tmpdir(), "quarry-cmake-probe-"));
		writeFileSync(join(project, "CMakeLists.txt"), CMAKE_LISTS);
		for (const [name, text] of [
			["src/main.cpp", MAIN],
			["src/mathx.cpp", LIBRARY],
			["include/mathx.hpp", HEADER],
		] as const) {
			mkdirSync(dirname(join(project, name)), { recursive: true });
			writeFileSync(join(project, name), text);
		}

		const build = join(project, "cmake-build-debug");
		const configured = spawnSync(
			"cmake",
			[
				"-S",
				project,
				"-B",
				build,
				"-DCMAKE_BUILD_TYPE=Debug",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
			],
			{ encoding: "utf8" },
		);
		if (configured.status !== 0) {
			throw new Error(`cmake configure failed: ${(configured.stderr ?? "").trim()}`);
		}
		const built = spawnSync("cmake", ["--build", build], { encoding: "utf8" });
		if (built.status !== 0) {
			throw new Error(`the project does not build: ${(built.stderr ?? "").trim()}`);
		}
		lines.push("  build       cmake configure + build accepted the code");

		const database = join(build, "compile_commands.json");
		if (!existsSync(database)) throw new Error(`no compile database at ${database}`);
		const entries = JSON.parse(readFileSync(database, "utf8")) as {
			arguments?: string[];
			command?: string;
		}[];
		const first = entries[0];
		const compiler = first?.arguments?.[0] ?? first?.command?.split(" ")[0] ?? "";
		if (compiler === "") throw new Error("the database names no compiler");
		lines.push(`  database    ${database}`);
		lines.push(`  compiler    ${compiler}`);

		const source = join(project, "src/main.cpp");
		const uri = fileUri(source);

		const before = await analyse("clangd", project, [], source, uri);
		lines.push(`  before      ${before.errors} error(s) — ${before.said}`);

		const after = await analyse(
			"clangd",
			project,
			[`${flags.dir}=${build}`, `${flags.driver}=${compiler}`],
			source,
			uri,
		);
		lines.push(`  after       ${after.errors} error(s) — ${after.said}`);
		lines.push(
			`  hover       ${after.hover.includes("mathx_counter") ? "mathx_counter resolved" : "NOT RESOLVED"}`,
		);

		if (after.errors !== 0) {
			failures.push(`the handed-off run reported ${after.errors} error(s): ${after.said}`);
			const said = after.stderr.trim().split("\n").slice(-3).join(" | ");
			if (said !== "") lines.push(`  stderr      ${said}`);
		}
		if (!after.hover.includes("mathx_counter")) {
			failures.push("hover did not resolve the extern declaration");
		}
		if (before.errors <= 0) {
			lines.push(
				"  note        the unconfigured run was clean too: clangd found a database itself",
			);
		}
	} catch (error) {
		failures.push(error instanceof Error ? error.message : String(error));
	} finally {
		if (project) rmSync(project, { recursive: true, force: true });
	}

	lines.push(`  result      ${failures.length === 0 ? "PASS" : "FAIL"}`);
	for (const failure of failures) lines.push(`  reason      ${failure}`);
	console.log(lines.join("\n"));
	if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
	console.error(`lsp-cmake-probe: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
