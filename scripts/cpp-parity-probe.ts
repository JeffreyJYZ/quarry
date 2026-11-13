#!/usr/bin/env bun
/**
 * C/C++ parity probe: what "matches CLion's compiler system" means here, measured against the
 * product rather than against a copy of its decisions.
 *
 * Each fixture is a project a CLion user actually has — presets with their own binary dir, a
 * toolchain file, a library plus an app that includes it by a build-system-only path, a project
 * configured into `cmake-build-debug/`, a generator that writes no compiler database, standard
 * headers through the compiler CMake chose, and a plain C++ project with no build system at all,
 * which quarry compiles itself. For each one the probe asks the product what it would
 * do, then does exactly that, and reports the consumers separately:
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
 *   tree      whether opening the project left a second build tree behind. The plan names the tree
 *             analysis reads, so a `build/` created only to have a database for clangd is a failure
 *             even when the hover happens to pass through it.
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
	mixedLanguagesFixture,
	multiConfigFixture,
	multiTargetFixture,
	plainFixture,
	positionOf,
	presetsFixture,
	profileFixture,
	systemHeaderFixture,
	toolchainFixture,
	twoTargetsFixture,
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
	plain: PlainSection | null;
	targets: Target[];
	handoff: Handoff | null;
}

/** The build quarry runs itself for a project with no build system. */
interface PlainSection {
	/** The commands in the order the build runs them: one per compiler, then the link. */
	commands?: PlainCommand[];
	/** The single command an older planner reported, read so its rows stay measurable. */
	program?: string | null;
	argv?: string[];
	cwd?: string;
	note: string | null;
}

/** One command a plain build runs; `program` is the resolved path the product would spawn. */
interface PlainCommand {
	program: string | null;
	argv: string[];
	cwd: string;
}

/** The commands a plain plan reports, whichever shape the planner printed. */
function plainCommands(section: PlainSection): PlainCommand[] {
	if (Array.isArray(section.commands)) return section.commands;
	if (!Array.isArray(section.argv)) return [];
	return [{ program: section.program ?? null, argv: section.argv, cwd: section.cwd ?? "." }];
}

interface CmakeSection {
	program: string | null;
	options: { preset: string; buildDir: string; toolchainFile: string };
	/** The profile the plan was asked for, in the spelling the settings file uses. */
	profile: string;
	/** The one target the plan names, or null when it builds everything. */
	target: string | null;
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
	/** Why the start had to configure the tree, when it did. */
	note: string | null;
}

/** One probe's answer from one clangd session. */
interface Measurement {
	hover: string | null;
	diagnostics: string[];
}

/** `PASS`/`FAIL` are measured; `n/a` is a consumer the row does not exercise. */
type Verdict = "PASS" | "FAIL" | "n/a";

interface Row {
	capability: string;
	build: Verdict;
	analysis: Verdict;
	targets: Verdict;
	/** The trees the product created beside the plan's own: a fallback tree is not a capability. */
	tree: Verdict;
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

/** Every file named `name` under `root`, so a configuration's own object can be found. */
function findNamed(root: string, name: string, depth = 0): string[] {
	if (depth > 5) return [];
	const found: string[] = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(path);
		} catch {
			continue;
		}
		if (stat.isDirectory()) found.push(...findNamed(path, name, depth + 1));
		else if (entry === name && stat.isFile()) found.push(path);
	}
	return found;
}

/** A compile command as a report token: the driver and the flags that decide its language. */
function describeArguments(args: string[] | null): string {
	if (args === null) return "no compile command";
	const language = args.filter(
		(arg) => arg.startsWith("-std=") || arg.startsWith("--std=") || arg === "-x",
	);
	const driver = basename(args[0] ?? "");
	return `${driver} ${language.join(" ")}`.trim();
}

/** The file API objects a CLion-grade CMake project asks for, written by the probe's own build. */
const QUERY_BODY = JSON.stringify(
	{
		requests: [
			{ kind: "codemodel", version: { major: 2 } },
			{ kind: "toolchains", version: { major: 1 } },
			{ kind: "cmakeFiles", version: { major: 1 } },
		],
	},
	null,
	2,
);

/**
 * Write the file API query into a build directory before CMake configures it.
 *
 * A CLion project's build directory carries one — CLion asks for the model, and so does quarry —
 * and the reply index it produces is the record of a finished configure. Without it every fixture
 * tree would read as never configured, and the probe could not tell "opening reconfigured a current
 * tree" from "opening produced the model this tree never had".
 */
function writeQuery(root: string, buildDir: string) {
	const directory = join(root, buildDir, ".cmake", "api", "v1", "query", "client-parity");
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "query.json"), QUERY_BODY);
}

function writeFixture(root: string, fixture: Fixture) {
	for (const [path, text] of Object.entries(fixture.files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
}

/**
 * Build `quarry-plan` once and return the executable cargo produced.
 *
 * `QUARRY_PLAN_BIN` skips the build so a caller can measure a planner built from another commit —
 * that is how the before/after in this task's report was taken, without editing the probe.
 */
async function planner(): Promise<string> {
	const override = process.env.QUARRY_PLAN_BIN;
	if (override !== undefined && override !== "") {
		if (!isFile(override)) throw new Error(`QUARRY_PLAN_BIN is not a file: ${override}`);
		return override;
	}
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

/** What one plan is asked for on the command line: a profile, and one target or everything. */
interface PlanFlags {
	profile?: string;
	target?: string;
}

/** Ask the product what it would do with `root`, right now. */
async function askPlan(binary: string, root: string, flags: PlanFlags = {}): Promise<Plan> {
	const args = [root];
	if (flags.profile !== undefined) args.push("--profile", flags.profile);
	if (flags.target !== undefined) args.push("--target", flags.target);
	const result = await run(binary, args, root);
	if (result.code !== 0)
		throw new Error(`quarry-plan ${args.join(" ")} failed: ${firstError(result.stderr)}`);
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
	if (
		!build.includes(
			"cmake_plan_target(source, profile, &CmakeOptions::for_root(source), target)",
		)
	) {
		facts.push("run_cmake_build no longer asks cmake_plan_target for its build and target");
	}
	if (!build.includes("configure_tree(")) {
		facts.push("run_cmake_build no longer configures through the shared configure sequence");
	}
	if (!build.includes("run_cmake(state, argv, source_root)")) {
		facts.push("run_cmake_build no longer runs the plan's configure argv");
	}
	if (!build.includes("run_cmake(state, &plan.build, source_root)")) {
		facts.push("run_cmake_build no longer runs plan.build");
	}
	const dispatch = read("build_task/default_cargo.rs");
	if (!dispatch.includes("run_cmake_build(state, &info.root, profile, target)")) {
		facts.push("build_project no longer passes the profile and target to the CMake build");
	}
	const profiles = read("build_task/profile.rs");
	if (!profiles.includes('"relwithdebinfo"') || !profiles.includes('"minsizerel"')) {
		facts.push("the build profile no longer names CLion's four configurations");
	}
	const model = read("build_task/cmake_model/configure.rs");
	if (!model.includes("write_query(request.build_root)")) {
		facts.push("the shared configure no longer writes the file API query before configuring");
	}
	if (!model.includes("synthesize_database(request.build_root)")) {
		facts.push("the shared configure no longer synthesises the database on success");
	}
	const handoff = read("lsp/handoff/configure.rs");
	if (!handoff.includes("configure_tree(request")) {
		facts.push("the hand-off no longer configures through the shared configure sequence");
	}
	if (!handoff.includes("configure_need(root, &plan.build_root")) {
		facts.push("the hand-off no longer asks the model whether the tree is current");
	}
	const database = read("lsp/handoff/database.rs");
	if (!database.includes("ensure_database(root, &plan)")) {
		facts.push("the hand-off no longer takes its database directory from the plan");
	}
	if (!database.includes("cmake_database(root, profile)")) {
		facts.push("the hand-off no longer configures the tree for the build profile");
	}
	if (!database.includes("plain_database(root)")) {
		facts.push("the hand-off no longer synthesises a database for a plain project");
	}
	const plain = read("build_task/run_plain_clang.rs");
	if (!plain.includes("let flags = build_flags(root_path, &sources);")) {
		facts.push("the plain build no longer derives its flags from the project");
	}
	if (!plain.includes("synthesize_plain_database(root_path, &sources)")) {
		facts.push("the plain build no longer writes the database it analyses with");
	}
	const session = read("lsp/start_session.rs");
	if (!session.includes("server_args(server, &info, &overrides.args, overrides.profile)")) {
		facts.push(
			"start_session no longer composes the server arguments with the profile in effect",
		);
	}
	if (!session.includes("command.args(&handoff.args)")) {
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

/** Whether the build wrote exactly this executable, and nothing of that name was there before. */
function wroteExecutable(root: string, name: string): boolean {
	return findExecutables(root, name, 0).length === 1;
}

/**
 * One plan's build, run exactly as it was reported: configure, then build.
 *
 * Every row that judges a build runs this and nothing else, so the argv in the report is the argv
 * that made the tree, not a copy of it.
 */
async function runBuild(
	root: string,
	section: CmakeSection,
	directory: string,
	cmake: string,
	row: Row,
): Promise<{ ok: boolean; reason: string }> {
	const program = section.program ?? cmake;
	const configure = await run(program, section.configure.slice(1), section.cwd, CMAKE_TIMEOUT);
	row.commands.push({
		line: `cd ${directory} && ${commandLine(root, section.configure)}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	if (configure.code !== 0) {
		return {
			ok: false,
			reason: `configure exited ${configure.code}: ${firstError(configure.stderr)}`,
		};
	}
	const built = await run(program, section.build.slice(1), section.cwd, CMAKE_TIMEOUT);
	row.commands.push({
		line: `cd ${directory} && ${commandLine(root, section.build)}`,
		verdict: built.code === 0 ? "PASS" : "FAIL",
	});
	if (built.code !== 0) {
		return { ok: false, reason: `build exited ${built.code}: ${firstError(built.stderr)}` };
	}
	return { ok: true, reason: "" };
}

/**
 * A plain project's build, run exactly as it was reported: every command in order, in its own cwd.
 *
 * A mixed C/C++ project needs more than one compiler, so the plan reports a sequence: one command
 * per compiler for the sources, then the link that joins them. The first failing command stops it.
 */
async function runPlainBuild(
	root: string,
	section: PlainSection,
	directory: string,
	row: Row,
): Promise<{ ok: boolean; reason: string }> {
	for (const command of plainCommands(section)) {
		const program = command.program ?? command.argv[0];
		const result = await run(program, command.argv.slice(1), command.cwd, CMAKE_TIMEOUT);
		const line = `cd ${directory} && ${commandLine(root, command.argv)}`;
		row.commands.push({ line, verdict: result.code === 0 ? "PASS" : "FAIL" });
		if (result.code !== 0) {
			const reason = `\`${line}\` exits ${result.code}: "${firstError(result.stderr)}"`;
			return { ok: false, reason };
		}
	}
	return { ok: true, reason: "" };
}

/**
 * The compile arguments CMake recorded for one source, from the database the plan's configure wrote.
 *
 * `arguments` is preferred where the generator writes it; a `command` string is split on whitespace,
 * which is enough to tell `-g` from its absence and is never used to judge a quoted path.
 */
function compileArguments(database: string, source: string): string[] | null {
	if (!isFile(database)) return null;
	let entries: { file: string; arguments?: string[]; command?: string }[];
	try {
		entries = JSON.parse(readFileSync(database, "utf8"));
	} catch {
		return null;
	}
	const entry = entries.find((candidate) => basename(candidate.file) === source);
	if (entry === undefined) return null;
	if (Array.isArray(entry.arguments)) return entry.arguments;
	return entry.command === undefined ? null : entry.command.split(/\s+/);
}

/** One profile's expectation: the configuration CMake names, its optimisation and its debug info. */
interface ProfileHalf {
	profile: string;
	configuration: string;
	optimisation: string;
	debugInfo: boolean;
}

/** Whether a compile command carries the optimisation and the debug info a profile promises. */
function profileFlags(args: string[], half: ProfileHalf): boolean {
	return args.includes(half.optimisation) && args.includes("-g") === half.debugInfo;
}

/** The `-O`/`-g` flags in a compile command, as one quoted fragment for a report line. */
function describeFlags(args: string[] | null): string {
	if (args === null) return "no compile command";
	const flags = args.filter((arg) => arg.startsWith("-O") || arg === "-g").join(" ");
	return flags === "" ? "no -O/-g flags" : JSON.stringify(flags);
}

/** `CMAKE_BUILD_TYPE` from a tree's own cache, or null when it has no cache to read. */
function cacheBuildType(tree: string): string | null {
	const file = join(tree, "CMakeCache.txt");
	if (!isFile(file)) return null;
	const line = readFileSync(file, "utf8")
		.split("\n")
		.find((row) => row.startsWith("CMAKE_BUILD_TYPE:"));
	return line === undefined ? "" : (line.split("=")[1] ?? "").trim();
}

/**
 * One profile row: the plan names it, CMake receives it, and the compile command carries the debug
 * info `RelWithDebInfo` promises while `MinSizeRel` produces none.
 *
 * Both halves run into the same tree, so the second configure is also the proof that a profile
 * change reconfigures the project instead of reusing the previous flags.
 *
 * The session is then started the way the window starts it — `quarry-plan --profile` is the seam
 * `start_lsp` hands the profile through — so the analysis half proves the hand-off reads the tree
 * the build wrote: its cache keeps the profile's configuration, its database carries the profile's
 * own optimization and debug info, and switching the profile back reconfigures once and says so.
 */
async function judgeProfile(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "FAIL",
		targets: "n/a",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;
	let passed = true;
	let analysed = true;
	let buildRoot: string | null = null;
	const halves = [
		{
			profile: "relwithdebinfo",
			configuration: "RelWithDebInfo",
			optimisation: "-O2",
			debugInfo: true,
		},
		{
			profile: "minsizerel",
			configuration: "MinSizeRel",
			optimisation: "-Os",
			debugInfo: false,
		},
	];
	for (const half of halves) {
		let plan: Plan;
		try {
			plan = await askPlan(plannerBin, root, { profile: half.profile });
		} catch (error) {
			passed = false;
			const message = error instanceof Error ? error.message : String(error);
			row.details.push(`profile      FAIL  ${half.profile}: ${message}`);
			findings.push(
				`${directory}: the product cannot be asked for ${half.configuration} — \`cd ${directory} && quarry-plan . --profile ${half.profile}\` answers: ${message}`,
			);
			break;
		}
		const section = plan.cmake;
		if (!section) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: the product reports no CMake plan`);
			break;
		}
		buildRoot = section.buildRoot;
		const wanted = `-DCMAKE_BUILD_TYPE=${half.configuration}`;
		const named =
			section.configure.includes(wanted) && section.build.includes(half.configuration);
		row.details.push(
			`profile      ${named ? "PASS" : "FAIL"}  ${half.profile}: configure ${section.configure.includes(wanted) ? "names" : "omits"} ${wanted}, build ${section.build.includes(half.configuration) ? "names" : "omits"} ${half.configuration}`,
		);
		if (!named) {
			passed = false;
			findings.push(
				`${directory}: the ${half.profile} plan does not ask CMake for ${half.configuration} — \`cd ${directory} && quarry-plan . --profile ${half.profile}\` reports ${commandLine(root, section.build)}.`,
			);
		}
		const ran = await runBuild(root, section, directory, cmake, row);
		if (!ran.ok) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: ${ran.reason}`);
			break;
		}
		const database = join(section.buildRoot, "compile_commands.json");
		const args = compileArguments(database, "main.cpp");
		if (args === null) {
			broken = true;
			row.details.push(
				`fixture FAIL  ${half.profile}: the build wrote no compile command for main.cpp in ${relative(root, database)}`,
			);
			break;
		}
		const carries = profileFlags(args, half);
		row.details.push(
			`profile      ${carries ? "PASS" : "FAIL"}  ${half.profile}: the compile command carries ${describeFlags(args)}, ${half.debugInfo ? "with" : "without"} -g`,
		);
		if (!carries) {
			passed = false;
			findings.push(
				`${directory}: ${half.configuration} must compile with ${half.optimisation} and ${half.debugInfo ? "with" : "without"} -g, but the compile command carries ${describeFlags(args)} — \`cd ${directory} && rg -- ${half.optimisation} ${relative(root, database)}\`.`,
			);
		}

		// The session start for this profile: the hand-off must read the tree the build wrote, and
		// that tree must still describe the profile this build compiled with.
		const opened = await askPlan(plannerBin, root, { profile: half.profile });
		const tree = opened.handoff?.databaseDir ?? null;
		const openArgs =
			tree === null
				? null
				: compileArguments(join(tree, "compile_commands.json"), "main.cpp");
		const configured = tree === null ? null : cacheBuildType(tree);
		const followed =
			tree === section.buildRoot &&
			configured === half.configuration &&
			openArgs !== null &&
			profileFlags(openArgs, half);
		row.commands.push({
			line: `cd ${directory} && quarry-plan . --profile ${half.profile}`,
			verdict: followed ? "PASS" : "FAIL",
		});
		row.details.push(
			`analysis     ${followed ? "PASS" : "FAIL"}  ${half.profile}: the hand-off names ${tree === null ? "no database" : relative(root, tree)} configured for ${configured ?? "nothing"} and carries ${describeFlags(openArgs)}`,
		);
		if (!followed) {
			analysed = false;
			findings.push(
				`${directory}: a ${half.profile} session must analyse the tree the ${half.configuration} build wrote, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${tree === null ? "no compile database" : relative(root, tree)}, whose CMAKE_BUILD_TYPE is ${configured ?? "unset"} and whose main.cpp entry carries ${describeFlags(openArgs)}.`,
			);
		}
	}

	// Switching the profile in settings must make the next session follow it: the loop leaves the
	// tree as MinSizeRel, so a RelWithDebInfo start is a genuine reconfigure — once, and said once.
	if (!broken && buildRoot !== null) {
		const cache = join(buildRoot, "CMakeCache.txt");
		const switched = await askPlan(plannerBin, root, { profile: "relwithdebinfo" });
		const tree = switched.handoff?.databaseDir ?? null;
		const switchedArgs =
			tree === null
				? null
				: compileArguments(join(tree, "compile_commands.json"), "main.cpp");
		const switchedType = tree === null ? null : cacheBuildType(tree);
		const followed =
			switchedType === "RelWithDebInfo" &&
			switchedArgs !== null &&
			profileFlags(switchedArgs, {
				profile: "relwithdebinfo",
				configuration: "RelWithDebInfo",
				optimisation: "-O2",
				debugInfo: true,
			}) &&
			(switched.handoff?.note ?? "") !== "";
		row.commands.push({
			line: `cd ${directory} && quarry-plan . --profile relwithdebinfo`,
			verdict: followed ? "PASS" : "FAIL",
		});
		row.details.push(
			`analysis     ${followed ? "PASS" : "FAIL"}  switching to relwithdebinfo: the tree is ${switchedType ?? "unconfigured"}, the database carries ${describeFlags(switchedArgs)}, and the start ${switched.handoff?.note ? `says ${JSON.stringify(switched.handoff.note)}` : "says nothing"}`,
		);
		if (!followed) {
			analysed = false;
			findings.push(
				`${directory}: switching the profile to relwithdebinfo must reconfigure the tree it analyses and report that once, but \`cd ${directory} && quarry-plan . --profile relwithdebinfo\` leaves ${relative(root, cache)} at ${switchedType ?? "unset"}, names a database carrying ${describeFlags(switchedArgs)}, and ${switched.handoff?.note ? "noted it" : "said nothing"}.`,
			);
		}

		const stable = statSync(cache).mtimeMs;
		const settled = await askPlan(plannerBin, root, { profile: "relwithdebinfo" });
		const quiet = (settled.handoff?.note ?? "") === "" && statSync(cache).mtimeMs === stable;
		row.details.push(
			`analysis     ${quiet ? "PASS" : "FAIL"}  a second start with the same profile ${quiet ? "does not configure again" : "reconfigured the tree again"}`,
		);
		if (!quiet) {
			analysed = false;
			findings.push(
				`${directory}: a second start with the profile unchanged must not configure again, but ${relative(root, cache)} changed or the start reported a reconfigure.`,
			);
		}
	}
	row.build = passed ? "PASS" : "FAIL";
	row.analysis = analysed ? "PASS" : "FAIL";
	return { row, findings, broken };
}

/**
 * One target row: asking for one executable builds it and not its sibling, and asking for nothing
 * builds both.
 *
 * The artefacts are checked, not the argv: a build that names a target and still writes everything
 * would pass an argv-only test and fail the user whose second executable takes ten minutes.
 */
async function judgeOneTarget(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "n/a",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	let one: Plan;
	try {
		one = await askPlan(plannerBin, root, { target: "cpp:parity_one" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.details.push(
			`target       FAIL  the product cannot be asked for one target: ${message}`,
		);
		findings.push(
			`${directory}: the product cannot be asked to build one target — \`cd ${directory} && quarry-plan . --target cpp:parity_one\` answers: ${message}`,
		);
		one = await askPlan(plannerBin, root);
	}
	const section = one.cmake;
	if (!section) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no CMake plan");
		return { row, findings, broken };
	}
	const named = section.build.join(" ").includes("--target parity_one");
	row.details.push(
		`target       ${named ? "PASS" : "FAIL"}  the plan names one target: ${commandLine(root, section.build)}`,
	);
	const first = await runBuild(root, section, directory, cmake, row);
	if (!first.ok) {
		broken = true;
		row.details.push(`fixture FAIL  one-target build: ${first.reason}`);
		return { row, findings, broken };
	}
	const builtOne = wroteExecutable(root, "parity_one");
	const builtTwo = wroteExecutable(root, "parity_two");
	row.commands.push({
		line: `cd ${directory} && ls -l build/parity_one build/parity_two`,
		verdict: builtOne && !builtTwo ? "PASS" : "FAIL",
	});
	row.details.push(
		`build        ${builtOne && !builtTwo ? "PASS" : "FAIL"}  after --target parity_one: parity_one ${builtOne ? "written" : "missing"}, parity_two ${builtTwo ? "written" : "missing"}`,
	);
	row.build = named && builtOne && !builtTwo ? "PASS" : "FAIL";
	if (row.build === "FAIL") {
		findings.push(
			`${directory}: asking for parity_one ${builtTwo ? "also built parity_two" : builtOne ? "did not build parity_one" : "built nothing"} — \`cd ${directory} && ${commandLine(root, section.build)}\` ${section.build.includes("--target") ? "does name a target" : "names no target, so cmake builds every target in the tree"}.`,
		);
	}

	const all = await askPlan(plannerBin, root);
	const everything = all.cmake;
	if (!everything) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no CMake plan without a target");
		return { row, findings, broken };
	}
	const second = await runBuild(root, everything, directory, cmake, row);
	if (!second.ok) {
		broken = true;
		row.details.push(`fixture FAIL  whole-tree build: ${second.reason}`);
		return { row, findings, broken };
	}
	const bothOne = wroteExecutable(root, "parity_one");
	const bothTwo = wroteExecutable(root, "parity_two");
	row.commands.push({
		line: `cd ${directory} && ls -l build/parity_one build/parity_two`,
		verdict: bothOne && bothTwo ? "PASS" : "FAIL",
	});
	row.details.push(
		`targets      ${bothOne && bothTwo ? "PASS" : "FAIL"}  after no --target: parity_one ${bothOne ? "written" : "missing"}, parity_two ${bothTwo ? "written" : "missing"}; the plan ${everything.target === null ? "names no target" : `still names ${everything.target}`}`,
	);
	row.targets = bothOne && bothTwo ? "PASS" : "FAIL";
	if (row.targets === "FAIL") {
		findings.push(
			`${directory}: a build with no target left parity_one ${bothOne ? "written" : "missing"} and parity_two ${bothTwo ? "written" : "missing"} — \`cd ${directory} && ${commandLine(root, everything.build)}\`.`,
		);
	}
	return { row, findings, broken };
}

/**
 * A mixed C/C++ plain project: each translation unit compiled as its own language, one link.
 *
 * Four consumers, because the defect this row exists for has four faces. The plan's database is
 * where a per-language command is recorded — a `.c` entry carrying a C++ driver or `-std=c++20` is
 * a C file compiled as C++, which breaks C the moment it uses something C-only. The build must
 * actually run those commands, the artefact must print the value the C function returned across the
 * `extern "C"` boundary, and clangd must answer in both translation units with no diagnostics —
 * a hover that answers while the file holds a "not allowed with C" error was never analysed as C.
 */
async function judgeMixedLanguages(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	_cmake: string,
	clangd: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "FAIL",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	// The fixture's own proof: each unit compiled by its own driver, linked, and run.
	for (const argv of fixture.plainBuild ?? []) {
		const result = await run(argv[0], argv.slice(1), root);
		row.commands.push({
			line: `cd ${directory} && ${argv.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) {
			broken = true;
			row.details.push(`fixture FAIL  ${argv.join(" ")}: ${firstError(result.stderr)}`);
		}
	}
	const reference = await run(join(root, "mixed"), [], root);
	if (!broken && (reference.code !== 0 || !reference.stdout.includes("mix=21"))) {
		broken = true;
		row.details.push(
			`fixture FAIL  ./mixed printed ${JSON.stringify(reference.stdout)} (wants "mix=21")`,
		);
	}

	const plan = await askPlan(plannerBin, root);
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: plan.plain ? "PASS" : "FAIL",
	});
	const section = plan.plain;
	if (!section) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no plain build for this project");
		return { row, findings, broken };
	}

	// 1. The database the hand-off names: one entry per translation unit, each in its own language.
	const database = plan.handoff?.databaseDir ?? null;
	const file = database === null ? null : join(database, "compile_commands.json");
	const cEntry = file === null ? null : compileArguments(file, "mix.c");
	const cxxEntry = file === null ? null : compileArguments(file, "main.cpp");
	const cDriver = cEntry === null ? "" : basename(cEntry[0] ?? "");
	const cxxDriver = cxxEntry === null ? "" : basename(cxxEntry[0] ?? "");
	const cStandard =
		cEntry !== null && cEntry.some((arg) => arg === "-std=c17" || arg === "-std=gnu17");
	const noCxxFlag = cEntry !== null && !cEntry.some((arg) => /^--?std=(gnu\+\+|c\+\+)/.test(arg));
	const cxxStandard =
		cxxEntry !== null && cxxEntry.some((arg) => arg === "-std=c++20" || arg === "-std=gnu++20");
	const languages = cDriver === "clang" && cStandard && noCxxFlag && cxxDriver === "clang++";
	row.details.push(
		`language     ${languages && cxxStandard ? "PASS" : "FAIL"}  ${database === null ? "no database" : relative(root, file as string)}: mix.c is ${JSON.stringify(describeArguments(cEntry))}, main.cpp is ${JSON.stringify(describeArguments(cxxEntry))}`,
	);
	if (!(languages && cxxStandard)) {
		row.build = "FAIL";
		findings.push(
			`${directory}: \`cd ${directory} && quarry-plan .\` names ${database === null ? "no compile database" : relative(root, file as string)}, whose mix.c entry is ${JSON.stringify(describeArguments(cEntry))} and whose main.cpp entry is ${JSON.stringify(describeArguments(cxxEntry))}. A C translation unit must be compiled as C and a C++ one as C++, so the .c entry needs the C driver and the C standard, never a C++ one.`,
		);
	}

	// 2. The build the product reports: the sequence, then what it produced.
	const ran = await runPlainBuild(root, section, directory, row);
	if (!ran.ok) {
		findings.push(
			`${directory}: the plain build fails — ${ran.reason}${section.note ? ` (it noted: ${section.note})` : ""}.`,
		);
	} else {
		row.details.push(`build        PASS  ${plainCommands(section).length} command(s)`);
	}
	const artifact = plan.targets[0]?.program ?? null;
	const executed = artifact === null ? null : await run(artifact, [], root);
	const prints = executed !== null && executed.code === 0 && executed.stdout.includes("mix=21");
	row.commands.push({
		line: `cd ${directory} && ${artifact === null ? "(no artifact)" : relative(root, artifact)}`,
		verdict: prints ? "PASS" : "FAIL",
	});
	row.targets = prints ? "PASS" : "FAIL";
	row.details.push(
		`targets      ${prints ? "PASS" : "FAIL"}  ${artifact === null ? "no target" : relative(root, artifact)} printed ${executed === null ? "nothing" : JSON.stringify(executed.stdout.trim())} (wants "mix=21")`,
	);
	if (!prints) {
		findings.push(
			`${directory}: the built program ${artifact === null ? "is unset" : relative(root, artifact)} printed ${executed === null ? "nothing" : JSON.stringify(executed.stdout.trim())} (exit ${executed?.code ?? "none"}), so the value the C function returns does not cross the extern "C" boundary — \`cd ${directory} && ls -l ${artifact === null ? "." : relative(root, artifact)}\`.`,
		);
	}
	row.build = languages && cxxStandard && ran.ok && prints ? "PASS" : "FAIL";

	// 3. Analysis in both translation units, with no diagnostic: an error in mix.c means its
	//    command is not a C one, however plausible the hover looks.
	const handoffArgs = plan.handoff?.args ?? [];
	const clangdCommand = commandLine(root, ["clangd", ...handoffArgs]);
	const clangdLine = row.commands.length;
	row.commands.push({ line: `cd ${directory} && ${clangdCommand}`, verdict: "PASS" });
	const measured = await analyse(clangd, root, fixture.probes, handoffArgs);
	let analysed = true;
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const diagnostics = measured[index]?.diagnostics ?? [];
		const ok = (hover?.includes(probe.expect) ?? false) && diagnostics.length === 0;
		const text = readFileSync(join(root, probe.file), "utf8");
		const position = positionOf(text, probe.needle);
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file}:${position.line + 1}:${position.character + 1} \`${probe.needle}\` -> ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok) {
			analysed = false;
			findings.push(
				`${directory}: the analysis cannot answer at ${probe.file}:${position.line + 1}:${position.character + 1} as ${probe.file.endsWith(".c") ? "C" : "C++"}, which needs ${probe.needs}. \`cd ${directory} && ${clangdCommand}\` answers ${describe(hover)}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}${database === null ? "" : `; the plan named ${relative(root, file as string)}`}.`,
			);
		}
	});
	row.analysis = analysed ? "PASS" : "FAIL";
	row.commands[clangdLine].verdict = row.analysis;
	return { row, findings, broken };
}

/** The configuration each build of a multi-config tree asks for, and what it must leave behind. */
interface ConfigHalf {
	profile: string;
	configuration: string;
	debugInfo: boolean;
}

/**
 * A multi-config tree built twice: the configuration reaches the compiler, and the run target
 * follows the configuration asked for.
 *
 * Two things are measured, and both were wrong for a tree that takes `--config` at build time. The
 * plan used to force `-DCMAKE_BUILD_TYPE` on a tree whose generator ignores it, which is the one
 * flag a multi-config configure must never carry. And the run target was resolved for `Debug`
 * whatever the profile, so it named the Debug artefact of a Release build — a path nothing wrote.
 *
 * Debug info is read from the object the configuration compiled with `otool -l`, not from the flags:
 * this linker keeps DWARF in the object, so the executable is identical either way and only the
 * object can tell the two configurations apart.
 */
async function judgeMultiConfig(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	writeFixture(root, fixture);
	writeQuery(root, "build");
	const row: Row = {
		capability: fixture.name,
		build: "FAIL",
		analysis: "n/a",
		targets: "FAIL",
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;
	let passed = true;
	let named = true;
	let buildRoot: string | null = null;

	for (const args of fixture.userBuild ?? []) {
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
	if (broken) return { row, findings, broken };

	const halves: ConfigHalf[] = [
		{ profile: "release", configuration: "Release", debugInfo: false },
		{ profile: "relwithdebinfo", configuration: "RelWithDebInfo", debugInfo: true },
	];
	for (const half of halves) {
		const plan = await askPlan(plannerBin, root, { profile: half.profile });
		const section = plan.cmake;
		if (!section) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: the product reports no CMake plan`);
			break;
		}
		buildRoot = section.buildRoot;
		const forced = section.configure.find((arg) => arg.startsWith("-DCMAKE_BUILD_TYPE="));
		const builds =
			section.build.includes("--config") && section.build.includes(half.configuration);
		row.details.push(
			`profile      ${forced === undefined && builds ? "PASS" : "FAIL"}  ${half.profile}: configure ${forced === undefined ? "names no build type" : `forces ${forced}`}, build ${builds ? `names ${half.configuration}` : `does not name ${half.configuration}`}`,
		);
		if (forced !== undefined || !builds) {
			passed = false;
			findings.push(
				`${directory}: the ${half.profile} plan must let the generator take its configuration at build time, but \`cd ${directory} && quarry-plan . --profile ${half.profile}\` runs ${commandLine(root, section.configure)} and ${commandLine(root, section.build)}. A multi-config tree never gets a -DCMAKE_BUILD_TYPE.`,
			);
		}

		// The target the dropdown names, before the build: it must be this configuration's artefact.
		const target = plan.targets[0] ?? null;
		const program = target?.program ?? null;
		const artifact =
			target === null ? null : join(section.buildRoot, half.configuration, target.target);
		const names = program !== null && program === artifact;
		row.details.push(
			`target       ${names ? "PASS" : "FAIL"}  ${half.profile}: the plan names ${program === null ? "no program" : relative(root, program)} (wants ${artifact === null ? "a target" : relative(root, artifact)})`,
		);
		if (!names) {
			named = false;
			findings.push(
				`${directory}: \`cd ${directory} && quarry-plan . --profile ${half.profile}\` names ${program === null ? "no program" : relative(root, program)} for its first target, but a ${half.configuration} build writes ${artifact === null ? "no artefact" : relative(root, artifact)}. The configuration asked for decides the artefact, not the Debug one.`,
			);
		}

		const ran = await runBuild(root, section, directory, cmake, row);
		if (!ran.ok) {
			broken = true;
			row.details.push(`fixture FAIL  ${half.profile}: ${ran.reason}`);
			break;
		}
		const written = artifact !== null && isFile(artifact);
		row.details.push(
			`build        ${written ? "PASS" : "FAIL"}  ${half.profile}: ${artifact === null ? "no artefact named" : relative(root, artifact)} ${written ? "written" : "missing"}`,
		);
		if (!written) {
			passed = false;
			findings.push(
				`${directory}: the ${half.profile} build wrote no ${artifact === null ? "artefact" : relative(root, artifact)} — \`cd ${directory} && ${commandLine(root, section.build)}\`.`,
			);
		} else {
			const executed = await run(artifact as string, [], root);
			const prints = executed.code === 0 && executed.stdout.includes("variant=7");
			row.commands.push({
				line: `cd ${directory} && ${relative(root, artifact as string)}`,
				verdict: prints ? "PASS" : "FAIL",
			});
			row.details.push(
				`build        ${prints ? "PASS" : "FAIL"}  ${half.profile}: the artefact printed ${JSON.stringify(executed.stdout.trim())} (wants "variant=7")`,
			);
			if (!prints) {
				passed = false;
				findings.push(
					`${directory}: the ${half.profile} artefact printed ${JSON.stringify(executed.stdout.trim())} (exit ${executed.code}) — \`cd ${directory} && ${relative(root, artifact as string)}\`.`,
				);
			}
		}
	}

	// Debug info, from the object each configuration compiled: the tool, not the flags.
	if (buildRoot !== null && !broken) {
		for (const half of halves) {
			const objects = findNamed(buildRoot, "main.cpp.o").filter((path) =>
				path.split("/").includes(half.configuration),
			);
			if (objects.length !== 1) {
				broken = true;
				row.details.push(
					`fixture FAIL  ${half.profile}: ${objects.length} main.cpp.o under ${relative(root, buildRoot)} for ${half.configuration}`,
				);
				continue;
			}
			const object = objects[0] as string;
			const otool = await run("/usr/bin/otool", ["-l", object], root);
			const dwarf = otool.stdout.includes("__DWARF");
			row.commands.push({
				line: `cd ${directory} && otool -l ${relative(root, object)} | rg __DWARF`,
				verdict: dwarf === half.debugInfo ? "PASS" : "FAIL",
			});
			row.details.push(
				`debug info   ${dwarf === half.debugInfo ? "PASS" : "FAIL"}  ${half.profile}: ${relative(root, object)} ${dwarf ? "carries" : "carries no"} __DWARF`,
			);
			if (dwarf !== half.debugInfo) {
				passed = false;
				findings.push(
					`${directory}: ${half.configuration} must compile ${half.debugInfo ? "with" : "without"} debug info, but \`cd ${directory} && otool -l ${relative(root, object)}\` ${dwarf ? "shows a __DWARF segment" : "shows no __DWARF segment"}.`,
				);
			}
		}
	}

	if (existsSync(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	row.build = passed ? "PASS" : "FAIL";
	row.targets = named ? "PASS" : "FAIL";
	return { row, findings, broken };
}

/** A path with the fixture root written as `.`, for a detail line. */
function relative(root: string, path: string): string {
	return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
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
		tree: "PASS",
		details: [],
		commands: [],
	};
	const findings: string[] = [];
	let broken = false;

	// 1. The build the project already has: the fixture's own proof of life. A plain project has none
	//    to borrow, so its own compile is written down and run as the standard its analysis is judged
	//    against.
	const plain = fixture.kind === "plain";
	if (plain) {
		for (const argv of fixture.plainBuild ?? []) {
			const result = await run(argv[0], argv.slice(1), root);
			row.commands.push({
				line: `cd ${directory} && ${argv.join(" ")}`,
				verdict: result.code === 0 ? "PASS" : "FAIL",
			});
			if (result.code !== 0) {
				broken = true;
				row.details.push(`fixture FAIL  ${argv.join(" ")}: ${firstError(result.stderr)}`);
			}
		}
	} else {
		writeQuery(root, dirname(fixture.userDb ?? "compile_commands.json"));
		for (const args of fixture.userBuild ?? []) {
			const result = await run(cmake, args, root);
			row.commands.push({
				line: `cd ${directory} && cmake ${args.join(" ")}`,
				verdict: result.code === 0 ? "PASS" : "FAIL",
			});
			if (result.code !== 0) {
				broken = true;
				row.details.push(
					`fixture FAIL  cmake ${args.join(" ")}: ${firstError(result.stderr)}`,
				);
			}
		}
	}
	const userDb = fixture.userDb === undefined ? null : join(root, fixture.userDb);
	const userDbExists = userDb !== null && existsSync(userDb);
	if (userDb !== null && !userDbExists && !fixture.dbOptional) {
		broken = true;
		row.details.push(`fixture FAIL  no ${fixture.userDb} after the CLion-shaped build`);
	}

	// 2. The expectations are the fixture's own truth, so cross-check them against the database its
	//    build wrote before judging the product's answer by them.
	if (userDb !== null && userDbExists) {
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
	const fixtureCache = userDb === null ? null : join(dirname(userDb), "CMakeCache.txt");
	const cacheBefore =
		fixtureCache !== null && isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	const madeBuildTreeBefore = isFile(join(root, "build", "CMakeCache.txt"));
	const opened = await askPlan(plannerBin, root);
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: opened.cmake || opened.plain ? "PASS" : "FAIL",
	});
	const openedTarget = opened.targets[0] ?? null;
	const cacheAfter =
		fixtureCache !== null && isFile(fixtureCache) ? statSync(fixtureCache).mtimeMs : null;
	if (cacheBefore !== null && cacheAfter !== cacheBefore && fixtureCache !== null) {
		row.details.push("handoff      FAIL  opening re-configured the project's own tree");
		findings.push(
			`${directory}: opening the project re-configured ${relative(dirname(userDb))}, though its compile_commands.json was current — \`cd ${directory} && ls -l --time-style=full-iso ${relative(fixtureCache)}\` changes across \`quarry-plan .\`.`,
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
			const namedFixtureDb = userDb !== null && database === dirname(userDb);
			const elsewhere =
				userDb !== null && userDbExists && !namedFixtureDb
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
	const plainSection = buildPlan.plain;
	if (plain) {
		if (!plainSection) {
			row.details.push("build        FAIL  the product reports no build for this project");
			findings.push(`${directory}: the product reports no build, so nothing would run.`);
		} else {
			const ran = await runPlainBuild(root, plainSection, directory, row);
			row.build = ran.ok ? "PASS" : "FAIL";
			if (!ran.ok) {
				row.details.push(`build        FAIL  the plain build ${ran.reason}`);
				findings.push(
					`${directory}: the plain build fails — ${ran.reason}${plainSection.note ? ` (it noted: ${plainSection.note})` : ""}.`,
				);
			} else {
				row.details.push(
					`build        PASS  ${plainCommands(plainSection).length} command(s) in ${plainCommands(plainSection)[0]?.cwd === root ? "." : relative(plainCommands(plainSection)[0]?.cwd ?? root)}`,
				);
			}
			if (plainSection.note) row.details.push(`note         ${plainSection.note}`);
		}
	} else if (!section) {
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
		const name = target?.target ?? section?.buildRoot.split("/").pop() ?? after.name;
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

	// 7. A second tree is not a capability. The plan names the tree analysis reads, so a `build/`
	//    the product configured only to have a database to hand clangd is a tree nobody wants: a
	//    project whose plan names another directory must be analysed from that directory.
	const planTree = opened.cmake?.buildRoot ?? null;
	const fallbackTree = join(root, "build");
	if (
		!madeBuildTreeBefore &&
		isFile(join(fallbackTree, "CMakeCache.txt")) &&
		planTree !== fallbackTree
	) {
		row.tree = "FAIL";
		row.details.push(
			`tree         FAIL  the hand-off configured ${relative(fallbackTree)} though the plan names ${planTree === null ? "no tree" : relative(planTree)}`,
		);
		findings.push(
			`${directory}: opening the project configured a second tree — ${relative(fallbackTree)} holds a CMakeCache.txt the fixture's own build never wrote, while the plan names ${planTree === null ? "no tree" : relative(planTree)}. \`cd ${directory} && ls build/CMakeCache.txt\`.`,
		);
	} else {
		row.details.push(
			`tree         PASS  no fallback tree; the plan names ${planTree === null ? "no tree" : relative(planTree)}`,
		);
	}

	// 8. A build tree inside the source directory is a CLion deviation worth naming.
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
	// Last, so the table shows the one project with no build system to borrow a database from.
	fixtures.push(plainFixture());

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
			`build ${judged.row.build} · analysis ${judged.row.analysis} · targets ${judged.row.targets} · tree ${judged.row.tree}`,
		);
	}

	// Capabilities with no shared consumer: a mixed-language plain project, a profile that reaches
	// the compiler, a build that names one target, and a multi-config tree built twice. Each judges
	// itself, because the columns the other rows measure say nothing about it.
	type Judge = (
		fixture: Fixture,
		root: string,
		plannerBin: string,
		cmake: string,
		clangd: string,
	) => Promise<{ row: Row; findings: string[]; broken: boolean }>;
	const extras: { fixture: Fixture; judged: Judge }[] = [
		{ fixture: mixedLanguagesFixture(), judged: judgeMixedLanguages },
		{ fixture: profileFixture(), judged: judgeProfile },
		{ fixture: twoTargetsFixture(), judged: judgeOneTarget },
	];
	if (generators.includes("Ninja Multi-Config")) {
		extras.push({
			fixture: multiConfigFixture("Ninja Multi-Config"),
			judged: judgeMultiConfig,
		});
	}
	for (const extra of extras) {
		const root = join(tempRoot, extra.fixture.name.replace(/[/: ]+/g, "-"));
		mkdirSync(root, { recursive: true });
		process.stdout.write(`running ${extra.fixture.name} … `);
		const result = await extra.judged(extra.fixture, root, plannerBin, cmake, clangd);
		rows.push(result.row);
		findings.push(...result.findings);
		broken = broken || result.broken;
		console.log(
			`build ${result.row.build} · analysis ${result.row.analysis} · targets ${result.row.targets} · tree ${result.row.tree}`,
		);
	}

	const columns = ["capability", "build", "analysis", "targets", "tree"];
	const width = Math.max(...rows.map((row) => row.capability.length), columns[0].length);
	const line = (cells: string[]) =>
		`${cells[0].padEnd(width)}  ${cells[1].padEnd(6)}  ${cells[2].padEnd(8)}  ${cells[3].padEnd(6)}  ${cells[4]}`;
	console.log("");
	console.log(line(columns));
	for (const row of rows) {
		console.log(line([row.capability, row.build, row.analysis, row.targets, row.tree]));
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
		(row) =>
			row.build === "FAIL" ||
			row.analysis === "FAIL" ||
			row.targets === "FAIL" ||
			row.tree === "FAIL",
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
