#!/usr/bin/env bun
/**
 * The Windows debugger row: does a `Debug` build from the Visual Studio generator stop where its
 * source says, show a local's value, move that value on a step, and run to exit through `lldb-dap`?
 *
 * `docs/plans/001-clion-parity.md` §4.1 names this as the one Windows gap — no debugger row runs
 * there — so this row exists to make the CI log itself the measurement. It discovers the generator
 * `cmake --help` lists and this machine can configure with, builds a two-unit C++ project in
 * `Debug`, finds the `lldb-dap` the image installed, and hands both to the assertions in
 * `windows-debug-assertions.ts`, which speaks the same DAP the product speaks.
 *
 * Every assertion prints one line. A failure prints the exact DAP request and response that produced
 * it, untruncated, plus lldb-dap's stderr: a Windows runner cannot be debugged by hand.
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
} from "./cpp-parity/windows";
import { assertDebugSession } from "./windows-debug-assertions";
import { DapClient } from "./windows-debug-dap-client";
import { disconnect } from "./windows-debug-dap-session";
import {
	BREAKPOINT_NEEDLE,
	CONFIGURATION,
	MAIN,
	STEP_NEEDLE,
	lineOf,
	programPath,
	writeFixture,
} from "./windows-debug-fixture";
import { causeLine, describeProbe } from "./windows-debug-adapter-report";
import { probeAdapter, type Probe } from "./windows-debug-adapter";
import { adapterCandidates } from "./windows-debug-candidates";
import { describeExit } from "./windows-debug-exit";
import { run, skipReason } from "./windows-debug-toolchain";

/** The prefix every line of the row carries, so a CI log can be grepped for its verdict. */
const LOG = "parity-windows-debug";

async function main(): Promise<number> {
	const cmake = Bun.which("cmake");
	const help = cmake === null ? null : await run(cmake, ["--help"], process.cwd());
	const generators = vsGenerators(help?.stdout ?? "");
	const candidates = adapterCandidates(process.env);
	const scratch = mkdtempSync(join(tmpdir(), "quarry-win-debug-"));

	const canProbe = cmake !== null && generators.length > 0 && candidates.length > 0;
	const detection = canProbe
		? await detectVsGenerator(generators, join(scratch, "generators"), cmake, run)
		: { generator: null, attempts: [] as string[] };

	if (help?.spawn !== null && help !== null) {
		// cmake exists on PATH but the OS will not create the process: name it, do not skip over it.
		console.log(`${LOG}  FAIL  could not spawn ${cmake}: ${help.spawn}`);
		return 1;
	}

	const skip = skipReason({
		cmake: cmake !== null,
		generators,
		configured: detection.generator,
		adapter: candidates[0]?.path ?? null,
	});
	if (skip !== null) {
		for (const attempt of detection.attempts) console.log(`${LOG}  attempt  ${attempt}`);
		console.log(`${LOG}  SKIP  ${skip}`);
		return 0;
	}
	const generator = detection.generator;
	if (generator === null || cmake === null) return 0;

	// Which adapter starts, not merely which exists: the image can ship a copy that is found and
	// cannot run, and the row must use the one a debugger actually works on. Each probe is printed
	// as it is decided, so a crash on a later candidate still leaves the earlier verdicts in the log.
	let chosen: string | null = null;
	const probes: Probe[] = [];
	for (const candidate of candidates) {
		const probe = await probeAdapter(candidate, run);
		probes.push(probe);
		for (const line of describeProbe(probe)) console.log(`${LOG}  ${line}`);
		if (probe.runs) {
			chosen = candidate.path;
			break;
		}
	}
	if (chosen === null) {
		console.log(`${LOG}  cause  ${causeLine(probes)}`);
		console.log(
			`${LOG}  FAIL  no lldb-dap on this machine could start (${candidates.length} found)`,
		);
		return 1;
	}
	const adapter = chosen;

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
	if (configured.spawn !== null) {
		console.log(`${LOG}  FAIL  could not spawn ${cmake}: ${configured.spawn}`);
		return 1;
	}
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
	const client = new DapClient(adapter, root);
	const checks = await assertDebugSession(client, {
		program,
		cwd: root,
		breakpointPath,
		breakpointLine: lineOf(MAIN, BREAKPOINT_NEEDLE),
		stepLine: lineOf(MAIN, STEP_NEEDLE),
	});
	// The product's own shutdown first: lldb-dap stays alive until it is disconnected, so a row that
	// only waits would sit out its timeout and then kill a session that had already finished.
	await disconnect(client);
	const exit = await client.waitForExit(3000);
	console.log(`${LOG}  note  lldb-dap exit ${describeExit(exit)}`);
	await client.stop();

	if (checks.hadFailure) {
		console.log(...checks.failures(client).map((line) => `${LOG}  ${line}`));
		console.log(`${LOG}  verdict FAIL (${checks.count} assertions)`);
		return 1;
	}
	console.log(`${LOG}  verdict PASS (${checks.count} assertions)`);
	return 0;
}

/** What the build tree holds, so a missing artefact names what is there instead of just the path. */
function artifactList(build: string): string {
	const parts = [listing(build, "build")];
	const configuration = join(build, CONFIGURATION);
	if (existsSync(configuration)) parts.push(listing(configuration, `build/${CONFIGURATION}`));
	return parts.join("; ");
}

/** One directory's first entries, named, or the reason it could not be read. */
function listing(directory: string, label: string): string {
	try {
		const entries = readdirSync(directory).slice(0, 12);
		return `${label} holds ${entries.length === 0 ? "nothing" : entries.join(", ")}`;
	} catch {
		return `${label} does not exist`;
	}
}

if (import.meta.main) process.exit(await main());
