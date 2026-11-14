/**
 * The Windows rows as the probe runs them: discover a generator this machine can configure with,
 * hand each row the probe's own machinery, and say so by name when there is none.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyse } from "./analysis";
import { CMAKE_TIMEOUT } from "./constants";
import { compileArguments } from "./database";
import type { Fixture } from "./fixtures/types";
import { vsFixture } from "./fixtures/windows";
import { commandLine, firstError } from "./format";
import { judgeMsvcToolchain } from "./judges/msvc-row";
import { judgeVisualStudio } from "./judges/vs-row";
import { askPlan } from "./plan";
import { isFile, run } from "./process";
import { writeFixture, writeQuery } from "./project";
import type { Row } from "./types";
import {
	detectVsGenerator,
	NO_VS,
	type VsDetection,
	vsGenerators,
	type WindowsHarness,
} from "./windows";

/** The Visual Studio generator search: the candidates `cmake --help` listed, and how each answered. */
export interface VsStatus extends VsDetection {
	candidates: string[];
}

/**
 * The Visual Studio generator this machine can configure with, and one line per candidate tried.
 *
 * `cmake --help` is a candidate list, not a fact: it names the generators this cmake supports, and a
 * runner image can list one whose Visual Studio instance is not installed. Each candidate is
 * therefore configured on a scratch project with the same `-A x64` argv the fixtures use, and the
 * first success wins — a run with none names every failure instead of skipping quietly.
 */
export async function visualStudio(
	cmake: string,
	help: string,
	tempRoot: string,
): Promise<VsStatus> {
	const candidates = vsGenerators(help);
	if (candidates.length === 0) return { candidates, generator: null, attempts: [] };
	const scratch = join(tempRoot, "vs-generator");
	mkdirSync(scratch, { recursive: true });
	const detected = await detectVsGenerator(candidates, scratch, cmake, run);
	return { candidates, ...detected };
}

/** The probe's own machinery, as the Windows rows ask the product and start clangd with it. */
function windowsHarness(
	fixture: Fixture,
	root: string,
	plannerBin: string,
	clangd: string | null,
): WindowsHarness {
	return {
		clangd,
		ask: (flags) => askPlan(plannerBin, root, flags),
		run: (bin, args, cwd) => run(bin, args, cwd, CMAKE_TIMEOUT),
		analyse: (probes, args) =>
			clangd === null ? Promise.resolve([]) : analyse(clangd, root, probes, args),
		compileArguments,
		commandLine: (argv) => commandLine(root, argv),
		firstError,
		isFile,
		writeFixture: () => writeFixture(root, fixture),
		writeQuery: (directory) => writeQuery(root, directory),
	};
}

/**
 * The two Windows rows, run through the same machinery every other row uses.
 *
 * A machine with no Visual Studio generator at all says so once per row, naming every candidate
 * that was tried; the rows only skip when none of them configured.
 */
export async function windowsRows(
	tempRoot: string,
	plannerBin: string,
	clangd: string | null,
	vs: VsStatus,
): Promise<{ rows: Row[]; findings: string[]; broken: boolean }> {
	if (vs.generator === null) {
		const why = `${NO_VS}${vs.attempts.length > 0 ? ` — ${vs.attempts.join("; ")}` : ""}`;
		const rows: Row[] = [];
		for (const capability of ["generator: Visual Studio", "toolchain: MSVC"]) {
			console.log(`skipping ${capability} … ${why}`);
			rows.push({
				capability,
				build: "SKIP",
				analysis: "SKIP",
				targets: "SKIP",
				tree: "SKIP",
				details: [`skipped      ${why}`],
				commands: [],
			});
		}
		return { rows, findings: [], broken: false };
	}
	const judges: {
		fixture: Fixture;
		judged: (
			fixture: Fixture,
			root: string,
			harness: WindowsHarness,
		) => Promise<{ row: Row; findings: string[]; broken: boolean }>;
	}[] = [
		{ fixture: vsFixture("generator: Visual Studio", vs.generator), judged: judgeVisualStudio },
		{ fixture: vsFixture("toolchain: MSVC", vs.generator), judged: judgeMsvcToolchain },
	];
	const rows: Row[] = [];
	const findings: string[] = [];
	let broken = false;
	for (const entry of judges) {
		const root = join(tempRoot, entry.fixture.name.replace(/[/: ]+/g, "-"));
		mkdirSync(root, { recursive: true });
		process.stdout.write(`running ${entry.fixture.name} … `);
		const harness = windowsHarness(entry.fixture, root, plannerBin, clangd);
		const judged = await entry.judged(entry.fixture, root, harness);
		rows.push(judged.row);
		findings.push(...judged.findings);
		broken = broken || judged.broken;
		console.log(
			`build ${judged.row.build} · analysis ${judged.row.analysis} · targets ${judged.row.targets} · tree ${judged.row.tree}`,
		);
	}
	return { rows, findings, broken };
}
