#!/usr/bin/env bun
/**
 * The Windows debugger row: does a `Debug` build from the Visual Studio generator stop where its
 * source says, show a local's value, move that value on a step, and run to exit through `lldb-dap`?
 *
 * `docs/plans/001-clion-parity.md` §4.1 names this as the one Windows gap — no debugger row runs
 * there — so this row exists to make the log itself the measurement. It configures and builds a
 * two-unit C++ project with the generator `cmake --help` lists and this machine can actually
 * configure with, finds the `lldb-dap` the image installed, launches it with the same handshake and
 * launch arguments `src-tauri/src/dap/**` sends, and asserts six things: the breakpoint is verified,
 * the stopped frame names that file and line, the local reads its value, a step reaches the next
 * statement, the local reads its new value, and continue runs the program to its end.
 *
 * Every assertion prints one line. A failure prints the exact DAP request and response that produced
 * it, untruncated, plus lldb-dap's stderr: a Windows runner cannot be debugged by hand, so the log
 * has to carry the cause.
 *
 * A machine with no Windows toolchain — no cmake, no Visual Studio generator, no toolset, no
 * `lldb-dap` — SKIPs with the reason that names the missing piece and exits 0.
 *
 * Usage: bun scripts/parity-windows-debug.ts
 */

import { existsSync, mkdtempSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detectVsGenerator,
	errorLines,
	NO_TOOLSET,
	toolsetMissing,
	vsGenerators,
} from "./cpp-parity-windows";
import { DapClient } from "./windows-debug-dap-client";
import {
	Checks,
	configurationDone,
	evaluate,
	integerValue,
	launchSession,
	runToExit,
	setBreakpoint,
	stepOver,
	topFrame,
	waitForStop,
} from "./windows-debug-dap-session";
import {
	BREAKPOINT_NEEDLE,
	CONFIGURATION,
	MAIN,
	MAIN_SOURCE,
	STEP_NEEDLE,
	lineOf,
	programPath,
	writeFixture,
} from "./windows-debug-fixture";
import { findAdapter, run, sameSource, skipReason, verbatimPath } from "./windows-debug-toolchain";

/** The prefix every line of the row carries, so a CI log can be grepped for its verdict. */
const LOG = "parity-windows-debug";

async function main(): Promise<number> {
	const cmake = Bun.which("cmake");
	const help = cmake === null ? "" : (await run(cmake, ["--help"], process.cwd())).stdout;
	const generators = vsGenerators(help);
	const adapter = findAdapter(process.env);
	const scratch = mkdtempSync(join(tmpdir(), "quarry-win-debug-"));

	const detectable = cmake !== null && generators.length > 0 && adapter !== null;
	const detection = detectable
		? await detectVsGenerator(generators, join(scratch, "generators"), cmake, run)
		: { generator: null, attempts: [] as string[] };

	const skip = skipReason({
		cmake: cmake !== null,
		generators,
		configured: detection.generator,
		adapter,
	});
	if (skip !== null) {
		for (const attempt of detection.attempts) console.log(`${LOG}  attempt  ${attempt}`);
		console.log(`${LOG}  SKIP  ${skip}`);
		return 0;
	}

	const generator = detection.generator;
	if (generator === null || cmake === null || adapter === null) return 0;

	// The project directory is canonicalised before the launch, which is the product's own rule: a
	// `/var/…` versus `/private/var/…` style mismatch leaves every breakpoint unverified.
	const root = realpathSync(mkdtempSync(join(tmpdir(), "quarry-win-debug-project-")));
	const breakpointPath = writeFixture(root);
	const build = join(root, "build");
	const program = programPath(build);
	console.log(`${LOG}  project  ${root}`);
	console.log(`${LOG}  adapter  ${adapter}`);
	console.log(`${LOG}  generator  ${generator}`);

	const configureArgs = ["-S", root, "-B", build, "-G", generator, "-A", "x64"];
	const configured = await run(cmake, configureArgs, root);
	if (configured.code !== 0) {
		if (toolsetMissing(configured.stderr)) {
			console.log(`${LOG}  SKIP  ${NO_TOOLSET}`);
			return 0;
		}
		console.log(`${LOG}  FAIL  configure: cmake ${configureArgs.join(" ")}`);
		for (const line of errorLines(configured.stderr)) console.log(`${LOG}  stderr  ${line}`);
		return 1;
	}

	const buildArgs = ["--build", build, "--config", CONFIGURATION];
	const built = await run(cmake, buildArgs, root);
	if (built.code !== 0) {
		console.log(`${LOG}  FAIL  build: cmake ${buildArgs.join(" ")}`);
		const output = errorLines(built.stdout);
		for (const line of output.length > 0 ? output : errorLines(built.stderr)) {
			console.log(`${LOG}  output  ${line}`);
		}
		return 1;
	}
	if (!existsSync(program)) {
		console.log(`${LOG}  FAIL  the ${CONFIGURATION} build wrote no ${program}`);
		console.log(`${LOG}  directory  ${artifactList(build)}`);
		return 1;
	}

	const checks = new Checks();
	const client = new DapClient(adapter, root);
	let from = client.mark();
	let failed = false;
	try {
		await launchSession(client, { program, cwd: root });

		const breakpointLine = lineOf(MAIN, BREAKPOINT_NEEDLE);
		const stepNeedleLine = lineOf(MAIN, STEP_NEEDLE);

		// The verbatim spelling first, because the plain one is the breakpoint the session keeps:
		// setting the same file again replaces it.
		const verbatim = verbatimPath(breakpointPath);
		if (verbatim !== null) {
			from = client.mark();
			const spelled = await setBreakpoint(client, verbatim, breakpointLine);
			checks.add(
				"breakpoint verified with Windows' verbatim path prefix",
				spelled.verified,
				spelled.message,
				from,
				client.mark(),
			);
		}

		from = client.mark();
		const placed = await setBreakpoint(client, breakpointPath, breakpointLine);
		checks.add(
			`breakpoint verified at ${MAIN_SOURCE}:${breakpointLine}`,
			placed.verified,
			placed.message,
			from,
			client.mark(),
		);

		from = client.mark();
		const stop = await configurationDone(client, from);
		const first = await topFrame(client, stop.threadId);
		checks.add(
			`stopped frame is ${MAIN_SOURCE}:${breakpointLine}`,
			sameSource(first.path, breakpointPath) && first.line === breakpointLine,
			`frame ${first.path}:${first.line} (reason ${stop.reason})`,
			from,
			client.mark(),
		);

		from = client.mark();
		const before = await evaluate(client, "total", first.id);
		checks.add(
			"evaluate total before the step reads 0",
			integerValue(before) === 0,
			`result ${JSON.stringify(before)}`,
			from,
			client.mark(),
		);

		from = client.mark();
		await stepOver(client, stop.threadId);
		const second = await waitForStop(client, from);
		const frame = await topFrame(client, second.threadId);
		checks.add(
			`step advanced past ${MAIN_SOURCE}:${breakpointLine}`,
			sameSource(frame.path, breakpointPath) && frame.line >= stepNeedleLine,
			`frame ${frame.path}:${frame.line}`,
			from,
			client.mark(),
		);

		from = client.mark();
		const after = await evaluate(client, "total", frame.id);
		checks.add(
			"evaluate total after the step reads 5",
			integerValue(after) === 5,
			`result ${JSON.stringify(after)}`,
			from,
			client.mark(),
		);

		from = client.mark();
		const ended = await runToExit(client, second.threadId, from);
		checks.add(
			`continue reached the program's end (${ended})`,
			ended === "exited" || ended === "terminated",
			`event ${ended}`,
			from,
			client.mark(),
		);

		failed = checks.hadFailure;
	} catch (error) {
		failed = true;
		const message = error instanceof Error ? error.message : String(error);
		console.log(`${LOG}  FAIL  ${message}`);
		console.log(`${LOG}  exchange`);
		console.log(...client.report(from));
	} finally {
		const exit = await client.waitForExit();
		console.log(`${LOG}  note  lldb-dap exit ${exit ?? "still running after 10s"}`);
		await client.stop();
	}

	if (failed) {
		console.log(...checks.failures(client).map((line) => `${LOG}  ${line}`));
		console.log(`${LOG}  verdict FAIL (${checks.count} assertions)`);
		return 1;
	}
	console.log(`${LOG}  verdict PASS (${checks.count} assertions)`);
	return 0;
}

/** What the build tree holds, so a missing artefact names what is there instead. */
function artifactList(build: string): string {
	try {
		const entries = readdirSync(build).slice(0, 12);
		return entries.length === 0 ? "the build tree is empty" : entries.join(", ");
	} catch {
		return "the build tree does not exist";
	}
}

if (import.meta.main) process.exit(await main());
