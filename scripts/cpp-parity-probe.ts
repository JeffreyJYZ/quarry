#!/usr/bin/env bun
/**
 * C/C++ parity probe: an executable statement of what "matches CLion's compiler system" means here.
 *
 * Each fixture is a project a CLion user actually has — presets with their own binary dir, a
 * toolchain file, a library plus an app that includes it by a build-system-only path, a project
 * configured into `cmake-build-debug/`, standard headers through the compiler CMake chose. For each
 * one the probe measures the three consumers separately:
 *
 *   build     quarry's own argv, taken from `src-tauri/src/build_task/absolute_path.rs`
 *             (`cmake -S <root> -B <root> -DCMAKE_BUILD_TYPE=… -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`),
 *             run against the tree a CLion build already left behind.
 *   analysis  clangd started the way quarry starts it — `current_dir` at the project root and no
 *             arguments (`src-tauri/src/lsp/start_session.rs`) — asked for hover at a position that
 *             needs the build system's flags. The same clangd given `--compile-commands-dir` is the
 *             reference: it proves the fixture answers at all, so a failure is quarry's, not the
 *             fixture's.
 *   targets   the executable quarry would list, from `src-tauri/src/launch/default_cpp.rs`: the first
 *             literal `add_executable` in the root manifest, searched in the directories that file
 *             names. A listed path that does not exist is a target the user cannot run.
 *
 * It prints PASS/FAIL per capability, a capability × consumer table, then one finding per failure
 * with the command that produced it. Exit 1 when a capability fails, 2 when a fixture itself is
 * broken (a probe defect, not a product finding).
 *
 * The fixtures are left in place on purpose: every finding quotes `cd <fixture> && …` against the
 * printed root, so a reader can rerun it by hand. The probe is not part of `scripts/integration.ts`
 * yet: it asserts failures that are still open, and would turn the integration job red.
 *
 * Usage: bun scripts/cpp-parity-probe.ts
 */

import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	type AnalysisProbe,
	type Fixture,
	generatorFixture,
	multiTargetFixture,
	positionOf,
	presetsFixture,
	systemHeaderFixture,
	toolchainFixture,
} from "./cpp-parity-fixtures";
import { fileUri, LspClient } from "./lsp-client";

const SOURCE = join(import.meta.dir, "..", "src-tauri", "src");
const RESPONSE_TIMEOUT = 20_000;
/**
 * clangd answers a one-file hover as soon as the file has parsed, and the publishDiagnostics wait
 * already tells us it has. The retry covers the AST race, not a cold index.
 */
const HOVER_TIMEOUT = 1_500;
/** How much of a hover goes into a report line; the signature is in the first clause. */
const CLIP = 140;

/** `cmake_configure_argv` with both paths at the project root, and `cmake_build_argv`. */
const QUARRY_CONFIGURE = [
	"-S",
	".",
	"-B",
	".",
	"-DCMAKE_BUILD_TYPE=Debug",
	"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
];
const QUARRY_BUILD = ["--build", ".", "--config", "Debug"];

interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

/** One probe's answer from one clangd session. */
interface Measurement {
	hover: string | null;
	diagnostics: string[];
}

type Verdict = "PASS" | "FAIL";

interface Row {
	capability: string;
	build: Verdict;
	analysis: Verdict;
	targets: Verdict;
	details: string[];
	/** Every command the row ran, with what it proved. */
	commands: { line: string; verdict: Verdict }[];
}

function run(bin: string, args: string[], cwd: string, timeout = 120_000): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (code: number | null, note = "") => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ code, stdout, stderr: stderr + note });
		};
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			finish(null, `\n[timed out after ${timeout}ms]\n`);
		}, timeout);
		child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
		child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
		child.on("error", (error) => finish(null, `\n[spawn error: ${error.message}]\n`));
		child.on("exit", (code) => finish(code));
	});
}

/** A tool the way quarry's `resolve` finds one: PATH first, then the install dirs a GUI launch lacks. */
function findTool(name: string): string | null {
	const dirs = [
		...(process.env.PATH ?? "").split(":").filter(Boolean),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		`${process.env.HOME}/.cargo/bin`,
	];
	for (const dir of dirs) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	if (name === "clangd") {
		const xcrun = Bun.spawnSync(["xcrun", "--find", "clangd"]);
		const found = xcrun.stdout.toString().trim();
		if (found && existsSync(found)) return found;
	}
	return null;
}

function serverPath(binary: string): string {
	const dirs = [dirname(binary), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
	const inherited = (process.env.PATH ?? "").split(":").filter(Boolean);
	return [...dirs, ...inherited].join(":");
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function firstLine(text: string): string {
	const line = text.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
	return line.trim().slice(0, 200);
}

/**
 * A failure's own words: CMake puts "CMake Error at CMakeLists.txt:7 (message):" on one line and the
 * message on the next, so the first non-empty line alone names the site and hides the reason.
 */
function firstError(text: string): string {
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
	const picked = lines.slice(0, 2).join(" ");
	return picked.slice(0, 300);
}

/** A hover as a report token: `null`, or the quoted first 140 characters of it. */
function describe(hover: string | null): string {
	if (hover === null) return "null";
	const clipped = hover.length <= CLIP ? hover : `${hover.slice(0, CLIP)}…`;
	return JSON.stringify(clipped);
}

function hoverText(result: unknown): string | null {
	if (result === null || result === undefined) return null;
	const contents = (result as { contents?: unknown }).contents;
	const parts: string[] = [];
	const collect = (value: unknown) => {
		if (typeof value === "string") parts.push(value);
		else if (Array.isArray(value)) for (const entry of value) collect(entry);
		else if (value && typeof value === "object" && "value" in value)
			parts.push(String((value as { value: unknown }).value));
	};
	collect(contents ?? result);
	const text = parts.join("\n").replace(/\s+/g, " ").trim();
	return text === "" ? null : text;
}

/** Latest diagnostics clangd published for `uri`, as one line each. */
function diagnosticsFor(client: LspClient, uri: string): string[] {
	const published = client
		.notificationsOf("textDocument/publishDiagnostics")
		.filter((message) => message.params?.uri === uri);
	const items = published.at(-1)?.params?.diagnostics;
	if (!Array.isArray(items)) return [];
	return items.slice(0, 3).map((item: { message: string }) => item.message);
}

/** Drive clangd the way one consumer does, and answer every probe's hover. */
async function analyse(
	binary: string,
	fixtureRoot: string,
	probes: AnalysisProbe[],
	compileCommandsDir?: string,
): Promise<Measurement[]> {
	const args = compileCommandsDir ? ["--compile-commands-dir", compileCommandsDir] : [];
	const client = new LspClient({ binary, cwd: fixtureRoot, args, path: serverPath(binary) });
	try {
		const id = client.request("initialize", {
			processId: process.pid,
			rootUri: fileUri(fixtureRoot),
			capabilities: { textDocument: { hover: { contentFormat: ["markdown", "plaintext"] } } },
			workspaceFolders: [{ uri: fileUri(fixtureRoot), name: basename(fixtureRoot) }],
		});
		const initialized = await client.waitForResponse(id, RESPONSE_TIMEOUT);
		if (!initialized)
			throw new Error(`clangd never answered initialize (${client.stderr.trim()})`);
		client.notify("initialized", {});

		const files = new Map<string, { uri: string; text: string }>();
		for (const probe of probes) {
			if (files.has(probe.file)) continue;
			const text = readFileSync(join(fixtureRoot, probe.file), "utf8");
			const uri = fileUri(join(fixtureRoot, probe.file));
			files.set(probe.file, { uri, text });
			client.notify("textDocument/didOpen", {
				textDocument: { uri, languageId: "cpp", version: 1, text },
			});
		}
		await client.waitForNotification("textDocument/publishDiagnostics", 1, 10_000);
		await new Promise((resolve) => setTimeout(resolve, 150));

		const measurements: Measurement[] = [];
		for (const probe of probes) {
			const file = files.get(probe.file);
			if (!file) throw new Error(`probe names an unopened file: ${probe.file}`);
			const position = positionOf(file.text, probe.needle);
			const deadline = Date.now() + HOVER_TIMEOUT;
			let hover: string | null = null;
			while (Date.now() < deadline) {
				const response = await client.ask(
					"textDocument/hover",
					{ textDocument: { uri: file.uri }, position },
					5_000,
				);
				if (response?.error) throw new Error(JSON.stringify(response.error));
				hover = hoverText(response?.result);
				if (hover) break;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			measurements.push({ hover, diagnostics: diagnosticsFor(client, file.uri) });
		}
		return measurements;
	} finally {
		client.kill();
	}
}

/** Every file named `name` under `root`, so a finding can say where the build actually wrote it. */
function findExecutables(root: string, name: string, depth = 0): string[] {
	if (depth > 4) return [];
	const found: string[] = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(path);
		} catch {
			continue;
		}
		if (stat.isDirectory()) found.push(...findExecutables(path, name, depth + 1));
		else if (entry === name && stat.isFile()) found.push(path);
	}
	return found;
}

/** The executable quarry's target list would offer, mirroring `launch/default_cpp.rs`. */
function listedTarget(root: string): { name: string; path: string; exists: boolean } {
	const manifest = readFileSync(join(root, "CMakeLists.txt"), "utf8");
	const target =
		/^[ \t]*add_executable[ \t]*\([ \t\r\n]*([A-Za-z0-9_.+-]+)/im.exec(manifest)?.[1] ??
		/^[ \t]*project[ \t]*\([ \t\r\n]*([A-Za-z0-9_.+-]+)/im.exec(manifest)?.[1] ??
		basename(root);
	const candidates = [
		join(root, target),
		join(root, "Debug", target),
		join(root, "Release", target),
		join(root, "build", target),
		join(root, "build", "Debug", target),
		join(root, "build", "Release", target),
		join(root, "cmake-build-debug", target),
		join(root, "cmake-build-release", target),
	];
	const existing = candidates.find(isFile);
	if (existing) return { name: target, path: existing, exists: true };
	const fallback = existsSync(join(root, "build"))
		? join(root, "build", target)
		: join(root, target);
	return { name: target, path: fallback, exists: false };
}

function writeFixture(root: string, fixture: Fixture) {
	for (const [path, text] of Object.entries(fixture.files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
}

function scanSource(needle: string): string[] {
	const hits: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else if (entry.endsWith(".rs") && readFileSync(path, "utf8").includes(needle))
				hits.push(path);
		}
	};
	walk(SOURCE);
	return hits;
}

/** What the Rust source says today, so the probe's emulation is tied to it rather than to memory. */
function sourceFacts(): string[] {
	const read = (path: string) => readFileSync(join(SOURCE, path), "utf8");
	const facts: string[] = [];
	if (!read("build_task/absolute_path.rs").includes("-DCMAKE_EXPORT_COMPILE_COMMANDS=ON")) {
		facts.push(
			"build_task/absolute_path.rs no longer passes -DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
		);
	}
	if (
		!read("build_task/default_cargo.rs").includes(
			"run_cmake_build(state, &info.root, &info.build_root, release)",
		)
	) {
		facts.push(
			"build_task/default_cargo.rs no longer builds a CMake project at its build_root",
		);
	}
	if (!read("lsp/start_session.rs").includes("command.args(&overrides.args);")) {
		facts.push("lsp/start_session.rs no longer hands clangd only its overrides");
	}
	const presets = scanSource("CMakePresets");
	if (presets.length > 0) facts.push(`CMake presets appear in ${presets.join(", ")}`);
	const commandsDir = scanSource("compile-commands-dir");
	if (commandsDir.length > 0)
		facts.push(`a compile-commands-dir flag exists in ${commandsDir.join(", ")}`);
	return facts;
}

function consequence(fixture: Fixture, databaseExists: boolean): string {
	if (fixture.dbOptional) {
		const generator = fixture.name.replace(/^generator: /, "");
		return databaseExists
			? `The ${generator} generator writes compile_commands.json into ${fixture.userDb}, and quarry passes no --compile-commands-dir, so clangd analyses without it`
			: `The ${generator} generator writes no compile_commands.json, and quarry passes no --compile-commands-dir, so clangd analyses every file with fallback flags`;
	}
	const known: Record<string, string> = {
		presets:
			"Quarry configures with its own argv, so a preset's binaryDir, generator and cache variables are never applied",
		toolchain:
			"Quarry never reads CMakePresets.json, so the toolchain file's define is missing from the compile command its own build records too: hover resolves the double overload instead of the int one",
		"multi-target":
			"Quarry starts clangd at the project root with no --compile-commands-dir, so a database in cmake-build-debug/ is invisible and the library include path never reaches the analysis",
		"system-headers":
			"Clangd falls back to its own guesses, so a standard header the project compiles against C++20 is unavailable to the analysis",
	};
	return known[fixture.name] ?? "";
}

async function judge(
	fixture: Fixture,
	root: string,
	cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean; inSource: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "FAIL",
		targets: "FAIL",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	// 1. The build a CLion user's project already has: the fixture's own proof of life.
	for (const args of fixture.userBuild) {
		const result = await run(cmake, args, root);
		row.commands.push({
			line: `cd ${directory} && cmake ${args.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) {
			broken = true;
			row.details.push(`fixture FAIL  cmake ${args.join(" ")}: ${firstError(result.stderr)}`);
		}
	}
	const userDb = join(root, fixture.userDb);
	const userDbExists = existsSync(userDb);
	if (!userDbExists && !fixture.dbOptional) {
		broken = true;
		row.details.push(`fixture FAIL  no ${fixture.userDb} after the CLion-shaped build`);
	}

	// 2. Targets and the opened analysis: the state a user sees when they open a CLion project.
	const before = listedTarget(root);
	row.targets = before.exists ? "PASS" : "FAIL";
	const relative = (path: string) => path.slice(root.length + 1);
	const userBuilt = findExecutables(root, before.name).map(relative);
	let reference: Measurement[] = [];
	if (userDbExists) {
		reference = await analyse(clangd, root, fixture.probes, dirname(userDb));
		if (reference.some((measurement) => measurement.hover === null)) {
			broken = true;
			row.details.push(
				"fixture FAIL  the reference analysis answered nothing with the database",
			);
		}
	}
	const opened = await analyse(clangd, root, fixture.probes);
	if (!userDbExists) {
		row.details.push(
			`analysis     FAIL  no ${fixture.userDb}: the generator records no compile command, so clangd has no flags`,
		);
		findings.push(
			`${directory}: the analysis has no flags at all — \`cd ${directory} && ls ${fixture.userDb}\` fails. ${consequence(fixture, false)}.`,
		);
	} else {
		row.analysis = fixture.probes.every((_, index) => {
			const want = reference[index]?.hover;
			return want !== undefined && want !== null && opened[index]?.hover === want;
		})
			? "PASS"
			: "FAIL";
	}

	// 3. quarry's build: `cmake -S . -B .` — the project root as both source and build root.
	const configure = await run(cmake, QUARRY_CONFIGURE, root);
	row.commands.push({
		line: `cd ${directory} && cmake ${QUARRY_CONFIGURE.join(" ")}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	const built = configure.code === 0 ? await run(cmake, QUARRY_BUILD, root) : null;
	if (built) {
		row.commands.push({
			line: `cd ${directory} && cmake ${QUARRY_BUILD.join(" ")}`,
			verdict: built.code === 0 ? "PASS" : "FAIL",
		});
	}
	row.build = configure.code === 0 && built?.code === 0 ? "PASS" : "FAIL";
	if (row.build === "FAIL") {
		const failed = configure.code === 0 ? built : configure;
		const command = configure.code === 0 ? QUARRY_BUILD : QUARRY_CONFIGURE;
		const reason = firstError(failed?.stderr ?? "");
		row.details.push(
			`build        FAIL  cmake ${command.join(" ")} exited ${failed?.code}: ${reason}`,
		);
		findings.push(
			`${directory}: the build fails — \`cd ${directory} && cmake ${command.join(" ")}\` exits ${failed?.code}: "${reason}". ${consequence(fixture, userDbExists)}.`,
		);
	} else {
		row.details.push(
			"build        PASS  configured and built with quarry's own argv (in-source)",
		);
	}
	const after = await analyse(clangd, root, fixture.probes);
	// CLion configures out of source; a build tree in the source directory is its own deviation, and
	// it is why the analysis changes behaviour after one build: clangd finds the database quarry wrote.
	const inSource = existsSync(join(root, "CMakeCache.txt"));
	if (inSource) {
		row.details.push(
			"tree         FAIL  configure wrote CMakeCache.txt into the source directory",
		);
	}

	// 4. Analysis verdicts, probe by probe, with the reference hover as the oracle. The opened state
	//    is what is judged; the other two are recorded so a reader can see what each fix would buy.
	if (userDbExists) {
		fixture.probes.forEach((probe, index) => {
			const want = reference[index]?.hover ?? null;
			const got = opened[index]?.hover ?? null;
			const later = after[index]?.hover ?? null;
			const verdict = want !== null && got === want ? "PASS" : "FAIL";
			const text = readFileSync(join(root, probe.file), "utf8");
			const position = positionOf(text, probe.needle);
			row.details.push(
				`analysis     ${verdict}  ${probe.file}:${position.line + 1}:${position.character + 1} \`${probe.needle}\` opens ${describe(got)} (reference ${describe(want)}, after quarry's build ${describe(later)})`,
			);
			if (verdict === "FAIL" && !broken) {
				const evidence = opened[index]?.diagnostics ?? [];
				findings.push(
					`${directory}: the analysis cannot answer at ${probe.file}:${position.line + 1}:${position.character + 1}, which needs ${probe.needs}. clangd started in ${directory} with no arguments answers ${describe(got)}${
						evidence.length > 0 ? `, with "${evidence[0]}"` : ""
					}; the same clangd with --compile-commands-dir ${fixture.userDb} answers ${describe(want)}. ${consequence(fixture, userDbExists)}.`,
				);
			}
		});
	}

	// 5. The target list, and where the CLion-shaped build actually wrote the program.
	if (before.exists) {
		row.details.push(`targets      PASS  ${before.name} -> ${relative(before.path)}`);
	} else {
		row.details.push(
			`targets      FAIL  ${before.name} -> ${relative(before.path)} does not exist; the CLion build wrote ${JSON.stringify(userBuilt)}`,
		);
		findings.push(
			`${directory}: the target list names ${before.name} at ${relative(before.path)}, which does not exist — \`cd ${directory} && ls -l ${relative(before.path)} ${userBuilt[0] ?? ""}\` shows the CLion build wrote ${JSON.stringify(userBuilt)}. Quarry searches the root, Debug and Release under it, build/ and cmake-build-debug/ under it (src-tauri/src/launch/default_cpp.rs), so a preset binary dir and a multi-config generator's config dir are both outside it.`,
		);
	}
	// A plain `build/` project is the one layout clangd finds without being told: that is why the
	// system-header row passes and every other layout does not, and it is worth saying out loud.
	if (row.analysis === "PASS" && fixture.userDb.startsWith("build/")) {
		row.details.push(
			"analysis     PASS  clangd found build/compile_commands.json on its own; a database in cmake-build-debug/ or a preset binary dir needs --compile-commands-dir",
		);
	}

	// 6. A preset project configured in-source turns its own cache into a conflict: measure, do not
	//    assume. Re-running the user's configure is the only way to know.
	if (fixture.files["CMakePresets.json"] !== undefined) {
		const again = await run(cmake, fixture.userBuild[0], root);
		if (again.code !== 0) {
			row.details.push(
				`regression   FAIL  after quarry's build, cmake ${fixture.userBuild[0].join(" ")} exits ${again.code}: ${firstError(again.stderr)}`,
			);
			findings.push(
				`${directory}: quarry's in-source configure writes CMakeCache.txt into the source tree, after which the project's own \`cd ${directory} && cmake ${fixture.userBuild[0].join(" ")}\` exits ${again.code}: "${firstError(again.stderr)}".`,
			);
		}
	}
	return { row, findings, broken, inSource };
}

async function main() {
	const started = Date.now();
	const cmake = findTool("cmake");
	const clangd = findTool("clangd");
	if (!cmake) throw new Error("cmake is not installed");
	if (!clangd) throw new Error("clangd is not installed");

	const generators = (await run(cmake, ["--help"], process.cwd())).stdout;
	const fixtures: Fixture[] = [presetsFixture(), toolchainFixture(), multiTargetFixture()];
	if (generators.includes("Xcode")) {
		fixtures.push(generatorFixture("generator: Xcode", "Xcode", "out/xcode"));
	}
	if (generators.includes("Ninja Multi-Config")) {
		fixtures.push(
			generatorFixture("generator: Ninja Multi-Config", "Ninja Multi-Config", "out/nmc"),
		);
	}
	fixtures.push(systemHeaderFixture());

	const tempRoot = mkdtempSync(join(tmpdir(), "quarry-cpp-parity-"));
	const rows: Row[] = [];
	const findings: string[] = [];
	const inSourceDirs: string[] = [];
	let broken = false;

	console.log("C/C++ parity probe — quarry");
	console.log(`  fixtures  ${tempRoot}`);
	console.log(`  cmake     ${firstLine((await run(cmake, ["--version"], tempRoot)).stdout)}`);
	console.log(`  clangd    ${firstLine((await run(clangd, ["--version"], tempRoot)).stdout)}`);
	for (const fact of sourceFacts()) console.log(`  drift     ${fact}`);

	for (const fixture of fixtures) {
		const root = join(tempRoot, fixture.name.replace(/[/: ]+/g, "-"));
		mkdirSync(root, { recursive: true });
		process.stdout.write(`running ${fixture.name} … `);
		const judged = await judge(fixture, root, cmake, clangd);
		rows.push(judged.row);
		findings.push(...judged.findings);
		broken = broken || judged.broken;
		if (judged.inSource) inSourceDirs.push(root);
		console.log(
			`build ${judged.row.build} · analysis ${judged.row.analysis} · targets ${judged.row.targets}`,
		);
	}
	if (inSourceDirs.length > 0) {
		findings.push(
			`every CMake project is configured in the source tree: quarry passes the project root as both -S and -B, so \`cd ${basename(inSourceDirs[0])} && ls CMakeCache.txt CMakeFiles Makefile\` finds a build tree beside the sources (${inSourceDirs.map((dir) => basename(dir)).join(", ")}). CLion always configures out of source. It is also why the analysis starts answering after one build: clangd then finds the compile_commands.json quarry wrote into the root.`,
		);
	}

	const columns = ["capability", "build", "analysis", "targets"];
	const width = Math.max(...rows.map((row) => row.capability.length), columns[0].length);
	const line = (cells: string[]) =>
		`${cells[0].padEnd(width)}  ${cells[1].padEnd(6)}  ${cells[2].padEnd(8)}  ${cells[3]}`;
	console.log("");
	console.log(line(columns));
	for (const row of rows)
		console.log(line([row.capability, row.build, row.analysis, row.targets]));

	console.log("\ndetails");
	for (const row of rows) {
		console.log(`  ${row.capability}`);
		for (const detail of row.details) console.log(`    ${detail}`);
	}

	console.log("\nfindings");
	if (findings.length === 0) console.log("  none: every capability passes");
	findings.forEach((finding, index) => {
		console.log(`  F${index + 1}  ${finding}`);
	});

	console.log("\ncommands");
	for (const row of rows) {
		for (const command of row.commands) {
			console.log(`  ${command.verdict.padEnd(4)}  ${command.line}`);
		}
	}

	const failed = rows.filter(
		(row) => row.build === "FAIL" || row.analysis === "FAIL" || row.targets === "FAIL",
	).length;
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	console.log(
		`\nresult  ${failed > 0 || broken ? "FAIL" : "PASS"}  (${failed} failing capability row(s), ${findings.length} finding(s), ${seconds}s)`,
	);
	if (broken) {
		console.log("a fixture is broken: fix the probe before reading the product findings");
		process.exit(2);
	}
	if (failed > 0) process.exit(1);
}

main().catch((error) => {
	console.error(`cpp-parity-probe: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(2);
});
