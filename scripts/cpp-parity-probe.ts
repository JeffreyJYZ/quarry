#!/usr/bin/env bun
/**
 * C/C++ parity probe: what "matches CLion's compiler system" means here, measured against the
 * product rather than against a copy of its decisions.
 *
 * Each fixture is a project a CLion user actually has — presets with their own binary dir, a
 * toolchain file, a library plus an app that includes it by a build-system-only path, a project
 * configured into `cmake-build-debug/`, a generator that writes no compiler database, standard
 * headers through the compiler CMake chose. For each one the probe asks the product what it would
 * do, then does exactly that, and reports the three consumers separately:
 *
 *   build     the argv `src-tauri/examples/quarry-plan.rs` reports, spawned in the working directory
 *             it reports. That binary prints the answer of `cmake_plan` — the same function
 *             `run_cmake_build` calls — so presets, the detected build root and the toolchain file
 *             are the product's decisions, not this script's.
 *   analysis  clangd spawned in the project root with the arguments the hand-off composes
 *             (`server_args`: `--compile-commands-dir`, `--query-driver`, plus the user's own), and
 *             asked for hover at a position that needs the build system's flags. The hover must
 *             contain the expectation the fixture's own build guarantees; when that build records a
 *             database, the same clangd given only `--compile-commands-dir` it produced is run as a
 *             cross-check of the expectation, so a wrong expectation fails the probe, not the row.
 *   targets   the rows `list_run_targets` offers and the program `resolve_run_target` names for the
 *             first of them, which is what Run would launch.
 *
 * It prints PASS/FAIL per capability, a capability × consumer table, then one finding per failure
 * with the command that produced it. Exit 1 when a capability fails, 2 when a fixture or the seam
 * is broken (a probe defect, not a product finding).
 *
 * The fixtures are left in place on purpose: every finding quotes `cd <fixture> && …` against the
 * printed root, so a reader can rerun it by hand.
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
	realpathSync,
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
const MANIFEST = join(import.meta.dir, "..", "src-tauri");
const RESPONSE_TIMEOUT = 20_000;
/** clangd answers a one-file hover as soon as the file has parsed; this bounds the retry. */
const HOVER_TIMEOUT = 1_500;
/** How much of a hover goes into a report line; the signature is in the first clause. */
const CLIP = 140;
const CMAKE_TIMEOUT = 180_000;
const CARGO_TIMEOUT = 900_000;

/** What `quarry-plan` prints: the product's own answer, one section per consumer. */
interface Plan {
	kind: string;
	root: string;
	name: string;
	buildRoot: string;
	cmake: CmakeSection | null;
	targets: Target[];
	handoff: Handoff | null;
}

interface CmakeSection {
	program: string | null;
	options: { preset: string; buildDir: string; toolchainFile: string };
	buildRoot: string;
	cwd: string;
	configure: string[];
	build: string[];
	note: string | null;
}

interface Target {
	id: string;
	label: string;
	kind: string;
	target: string;
	program: string | null;
	error: string | null;
}

interface Handoff {
	server: string;
	args: string[];
	databaseDir: string | null;
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

interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
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
	if (name === "clangd" || name === "cargo") {
		const xcrun = Bun.spawnSync(["xcrun", "--find", name]);
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
	return lines.slice(0, 2).join(" ").slice(0, 300);
}

/** A hover as a report token: `null`, or the quoted first 140 characters of it. */
function describe(hover: string | null): string {
	if (hover === null) return "null";
	return JSON.stringify(hover.length <= CLIP ? hover : `${hover.slice(0, CLIP)}…`);
}

/** An argv as a readable command, with the fixture root written as `.`. */
function commandLine(root: string, argv: string[]): string {
	const program = basename(argv[0] ?? "cmake");
	return [program, ...argv.slice(1)].join(" ").split(root).join(".");
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

/** Start clangd the way the product starts it, with `args`, and answer every probe's hover. */
async function analyse(
	binary: string,
	fixtureRoot: string,
	probes: AnalysisProbe[],
	args: string[],
): Promise<Measurement[]> {
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

/** Every file named `name` under `root`, so a finding can say where a build actually wrote it. */
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

function writeFixture(root: string, fixture: Fixture) {
	for (const [path, text] of Object.entries(fixture.files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
}

/** Build `quarry-plan` once and return the executable cargo produced. */
async function planner(): Promise<string> {
	const result = await run(
		"cargo",
		["build", "--example", "quarry-plan", "--message-format=json"],
		MANIFEST,
		CARGO_TIMEOUT,
	);
	for (const line of result.stdout.split("\n")) {
		if (!line.trim().startsWith("{")) continue;
		try {
			const message = JSON.parse(line);
			if (message.reason === "compiler-artifact" && message.target?.name === "quarry-plan") {
				if (typeof message.executable === "string" && isFile(message.executable)) {
					return message.executable;
				}
			}
		} catch {
			// cargo prints non-JSON lines too; the artifact line is the one this needs.
		}
	}
	throw new Error(`cargo never reported a quarry-plan executable: ${firstError(result.stderr)}`);
}

/** Ask the product what it would do with `root`, right now. */
async function askPlan(binary: string, root: string): Promise<Plan> {
	const result = await run(binary, [root], root);
	if (result.code !== 0)
		throw new Error(`quarry-plan ${root} failed: ${firstError(result.stderr)}`);
	return JSON.parse(result.stdout) as Plan;
}

/**
 * What the Rust source still says, so the seam cannot silently drift away from the product's path.
 *
 * Each line is the call the product makes into the function the seam reports: if one moves, the
 * probe must be retargeted rather than keep measuring a decision nothing runs.
 */
function seamFacts(): string[] {
	const read = (path: string) => readFileSync(join(SOURCE, path), "utf8");
	const facts: string[] = [];
	const build = read("build_task/absolute_path.rs");
	if (!build.includes("cmake_plan(source, release, &CmakeOptions::for_root(source))")) {
		facts.push("run_cmake_build no longer asks cmake_plan for its build");
	}
	if (!build.includes("run_cmake(state, &plan.configure, source_root)")) {
		facts.push("run_cmake_build no longer runs plan.configure");
	}
	if (!build.includes("run_cmake(state, &plan.build, source_root)")) {
		facts.push("run_cmake_build no longer runs plan.build");
	}
	const session = read("lsp/start_session.rs");
	if (!session.includes("server_args(server, &info, &overrides.args)")) {
		facts.push("start_session no longer composes the server arguments with server_args");
	}
	if (!session.includes("command.args(&args)")) {
		facts.push("start_session no longer spawns the server with the composed arguments");
	}
	const commands = read("launch/targets/commands.rs");
	if (!commands.includes("list_targets(&root)")) {
		facts.push("list_run_targets no longer calls list_targets");
	}
	if (!commands.includes("resolve_target(&root, &id, stop_on_entry)")) {
		facts.push("resolve_run_target no longer calls resolve_target");
	}
	return facts;
}

async function judge(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	const relative = (path: string) =>
		path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
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

	// 2. The expectations are the fixture's own truth, so cross-check them against the database its
	//    build wrote before judging the product's answer by them.
	if (userDbExists) {
		const reference = await analyse(clangd, root, fixture.probes, [
			`--compile-commands-dir=${dirname(userDb)}`,
		]);
		fixture.probes.forEach((probe, index) => {
			const hover = reference[index]?.hover ?? null;
			if (hover === null || !hover.includes(probe.expect)) {
				broken = true;
				row.details.push(
					`fixture FAIL  ${probe.file} \`${probe.needle}\` does not answer ${JSON.stringify(probe.expect)} from ${fixture.userDb}: ${describe(hover)}`,
				);
			}
		});
	}

	// 3. The plan as the project is opened: the target rows and the hand-off the session would make.
	//    A tree already configured by CLion must be found as it stands, so its cache timestamp is the
	//    witness that opening did not reconfigure it.
	const fixtureCache = join(dirname(userDb), "CMakeCache.txt");
	const cacheBefore = isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	const madeBuildTreeBefore = isFile(join(root, "build", "CMakeCache.txt"));
	const opened = await askPlan(plannerBin, root);
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: opened.cmake ? "PASS" : "FAIL",
	});
	const openedTarget = opened.targets[0] ?? null;
	const cacheAfter = isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	const madeBuildTree = !madeBuildTreeBefore && isFile(join(root, "build", "CMakeCache.txt"));
	if (cacheBefore !== null && cacheAfter !== cacheBefore) {
		row.details.push("handoff      FAIL  opening re-configured the project's own tree");
		findings.push(
			`${directory}: opening the project re-configured ${relative(dirname(userDb))}, though its compile_commands.json was current — \`cd ${directory} && ls -l --time-style=full-iso ${relative(fixtureCache)}\` changes across \`quarry-plan .\`.`,
		);
	} else if (!userDbExists && madeBuildTree) {
		row.details.push(
			"handoff      note  the build writes no database, so the hand-off configured build/ for it",
		);
	}

	// 4. Analysis with exactly the arguments the product composes.
	const handoffArgs = opened.handoff?.args ?? [];
	const clangdCommand = commandLine(root, ["clangd", ...handoffArgs]);
	const clangdLine = row.commands.length;
	row.commands.push({
		line: `cd ${directory} && ${clangdCommand}`,
		verdict: "PASS",
	});
	const measured = await analyse(clangd, root, fixture.probes, handoffArgs);
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const ok = hover?.includes(probe.expect) ?? false;
		const text = readFileSync(join(root, probe.file), "utf8");
		const position = positionOf(text, probe.needle);
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file}:${position.line + 1}:${position.character + 1} \`${probe.needle}\` -> ${describe(hover)} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok && !broken) {
			const evidence = measured[index]?.diagnostics ?? [];
			const database = opened.handoff?.databaseDir ?? null;
			const namedFixtureDb = database !== null && database === dirname(userDb);
			const elsewhere =
				userDbExists && !namedFixtureDb
					? `, though ${fixture.userDb} exists and records the flags the build used`
					: "";
			findings.push(
				`${directory}: the analysis cannot answer at ${probe.file}:${position.line + 1}:${position.character + 1}, which needs ${probe.needs}. \`cd ${directory} && ${clangdCommand}\` answers ${describe(hover)}${
					evidence.length > 0 ? `, with "${evidence[0]}"` : ""
				}; the plan named ${database === null ? "no compile database" : relative(database)}${elsewhere}. The fixture's own build guarantees ${JSON.stringify(probe.expect)}.`,
			);
		}
	});
	row.analysis = fixture.probes.every((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		return hover?.includes(probe.expect) === true;
	})
		? "PASS"
		: "FAIL";
	row.commands[clangdLine].verdict = row.analysis;

	// 5. The build: a fresh plan, because the product recomputes it when Build is pressed.
	const buildPlan = await askPlan(plannerBin, root);
	const section = buildPlan.cmake;
	if (!section) {
		row.details.push("build        FAIL  the product reports no CMake plan for this project");
		findings.push(`${directory}: the product reports no CMake plan, so no build can run.`);
	} else {
		const program = section.program ?? cmake;
		const configure = await run(
			program,
			section.configure.slice(1),
			section.cwd,
			CMAKE_TIMEOUT,
		);
		row.commands.push({
			line: `cd ${directory} && ${commandLine(root, section.configure)}`,
			verdict: configure.code === 0 ? "PASS" : "FAIL",
		});
		const built =
			configure.code === 0
				? await run(program, section.build.slice(1), section.cwd, CMAKE_TIMEOUT)
				: null;
		if (built) {
			row.commands.push({
				line: `cd ${directory} && ${commandLine(root, section.build)}`,
				verdict: built.code === 0 ? "PASS" : "FAIL",
			});
		}
		row.build = configure.code === 0 && built?.code === 0 ? "PASS" : "FAIL";
		if (row.build === "FAIL") {
			const failed = configure.code === 0 ? built : configure;
			const command = commandLine(
				root,
				configure.code === 0 ? section.build : section.configure,
			);
			const reason = firstError(failed?.stderr ?? "");
			row.details.push(`build        FAIL  ${command} exited ${failed?.code}: ${reason}`);
			findings.push(
				`${directory}: the build fails — \`cd ${directory} && ${command}\` exits ${failed?.code}: "${reason}". The plan chose ${relative(section.buildRoot)}${section.note ? ` and noted: ${section.note}` : ""}.`,
			);
		} else {
			row.details.push(
				`build        PASS  ${commandLine(root, section.configure)} in ${section.cwd === root ? "." : relative(section.cwd)}, tree ${relative(section.buildRoot)}`,
			);
		}
		if (section.note) row.details.push(`note         ${section.note}`);
	}

	// 6. The target list after the build: what the dropdown offers and what Run would launch.
	const after = await askPlan(plannerBin, root);
	const target = after.targets[0] ?? null;
	const program = target?.program ?? null;
	const exists = program !== null && isFile(program);
	row.targets = exists ? "PASS" : "FAIL";
	row.commands.push({
		line: `cd ${directory} && ls -l ${program === null ? "(no target)" : relative(program)}`,
		verdict: exists ? "PASS" : "FAIL",
	});
	if (exists && target) {
		row.details.push(`targets      PASS  ${target.id} -> ${relative(program as string)}`);
	} else {
		const name = target?.target ?? section?.buildRoot.split("/").pop() ?? "";
		const written = findExecutables(root, name).map(relative);
		row.details.push(
			`targets      FAIL  ${target?.id ?? "no target"} -> ${program === null ? "no program" : relative(program)} does not exist; builds wrote ${JSON.stringify(written)}`,
		);
		findings.push(
			`${directory}: the target list offers ${target?.id ?? "nothing"} whose program ${program === null ? "is unset" : relative(program)} does not exist — \`cd ${directory} && ls -l ${program === null ? "." : relative(program)}\` fails while the builds wrote ${JSON.stringify(written)}.`,
		);
	}
	if (openedTarget && target && openedTarget.program !== target.program) {
		row.details.push(
			`targets      note  on open it named ${openedTarget.program === null ? "nothing" : relative(openedTarget.program)}; after the build it names ${target.program === null ? "nothing" : relative(target.program)}`,
		);
	}

	// 7. A build tree inside the source directory is a CLion deviation worth naming.
	if (existsSync(join(root, "CMakeCache.txt"))) {
		row.details.push(
			"tree         FAIL  a configure wrote CMakeCache.txt into the source directory",
		);
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`. CLion configures out of source.`,
		);
	}
	return { row, findings, broken };
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
		fixtures.push(generatorFixture("generator: Xcode", "Xcode"));
	}
	if (generators.includes("Ninja Multi-Config")) {
		fixtures.push(generatorFixture("generator: Ninja Multi-Config", "Ninja Multi-Config"));
	}
	fixtures.push(systemHeaderFixture());

	// Canonical, because the product reports canonical paths (`/private/var` over `/var`) and every
	// relative path in this report is measured against this root.
	const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "quarry-cpp-parity-")));
	const rows: Row[] = [];
	const findings: string[] = [];
	let broken = false;

	const plannerBin = await planner();
	console.log("C/C++ parity probe — quarry");
	console.log(`  fixtures  ${tempRoot}`);
	console.log(`  planner   ${plannerBin}`);
	console.log(`  cmake     ${firstLine((await run(cmake, ["--version"], tempRoot)).stdout)}`);
	console.log(`  clangd    ${firstLine((await run(clangd, ["--version"], tempRoot)).stdout)}`);
	for (const fact of seamFacts()) {
		console.log(`  drift     ${fact}`);
		broken = true;
	}

	for (const fixture of fixtures) {
		const root = join(tempRoot, fixture.name.replace(/[/: ]+/g, "-"));
		mkdirSync(root, { recursive: true });
		process.stdout.write(`running ${fixture.name} … `);
		const judged = await judge(fixture, root, plannerBin, cmake, clangd);
		rows.push(judged.row);
		findings.push(...judged.findings);
		broken = broken || judged.broken;
		console.log(
			`build ${judged.row.build} · analysis ${judged.row.analysis} · targets ${judged.row.targets}`,
		);
	}

	const columns = ["capability", "build", "analysis", "targets"];
	const width = Math.max(...rows.map((row) => row.capability.length), columns[0].length);
	const line = (cells: string[]) =>
		`${cells[0].padEnd(width)}  ${cells[1].padEnd(6)}  ${cells[2].padEnd(8)}  ${cells[3]}`;
	console.log("");
	console.log(line(columns));
	for (const row of rows) {
		console.log(line([row.capability, row.build, row.analysis, row.targets]));
	}

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
		console.log(
			"a fixture or the seam is broken: fix the probe before reading the product findings",
		);
		process.exit(2);
	}
	if (failed > 0) process.exit(1);
}

main().catch((error) => {
	console.error(`cpp-parity-probe: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(2);
});
