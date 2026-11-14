/**
 * What both Windows rows share: the database they read back, how a path is spelled in a report, the
 * blank and skipped rows, and the analysis both of them judge.
 */

import { realpathSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { AnalysisProbe, Fixture } from "../fixtures/types";
import { VS_BUILD_DIR } from "../fixtures/windows";
import type { Plan, Row, Verdict } from "../types";
import { errorLines, NO_CLANGD, NO_TOOLSET, toolsetMissing, type WindowsHarness } from "../windows";

/** One entry of the database, as the row reads it back. */
export interface DbEntry {
	directory: string;
	file: string;
	arguments?: string[];
	command?: string;
}

/** A path with Windows and POSIX separators made the same, so comparisons are about the path. */
export function normalised(path: string): string {
	return path.replaceAll("\\", "/");
}

/** A path folded the way the filesystem compares it: case-insensitive on Windows only. */
function folded(path: string): string {
	const slashed = normalised(path);
	return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

/**
 * Whether two spellings name one file.
 *
 * The fixture root reaches the probe as a Windows short (8.3) path (`C:\Users\RUNNER~1\…`) while
 * CMake's file API and the build root name the long form (`C:\Users\runneradmin\…`), so comparing
 * the strings alone fails for a file that exists. Where both paths exist, the filesystem decides;
 * where one is not built yet, the folded spelling is the only evidence there is.
 */
export function samePath(one: string, other: string): boolean {
	let first: string | null = null;
	let second: string | null = null;
	try {
		first = folded(realpathSync.native(one));
		second = folded(realpathSync.native(other));
	} catch {
		// A path that does not exist yet cannot be resolved, and is compared as spelled.
	}
	if (first !== null && second !== null) return first === second;
	return folded(one) === folded(other);
}

/** A path relative to the fixture root, for a report line that stays short. */
export function shown(root: string, path: string): string {
	const base = `${normalised(root)}/`;
	const full = normalised(path);
	return full.startsWith(base) ? full.slice(base.length) : path;
}

/** The Win32 verbatim marker, which no build tool accepts as an argument. */ function hasVerbatim(
	argument: string,
): boolean {
	return argument.includes("\\\\?\\");
}

/** Every argument carrying that marker, for a finding that names them. */
export function verbatimArguments(argv: string[]): string[] {
	return argv.filter(hasVerbatim);
}

/** Every database entry for `source`, by file name, whichever configuration wrote it. */
export function entriesFor(database: string, source: string): DbEntry[] {
	try {
		const all = JSON.parse(readFileSync(database, "utf8")) as DbEntry[];
		return all.filter((entry) => basename(normalised(entry.file)) === source);
	} catch {
		return [];
	}
}

/** An empty row, so both judges start from the same verdicts. */
export function blankRow(capability: string): Row {
	return {
		capability,
		build: "FAIL",
		analysis: "FAIL",
		targets: "n/a",
		tree: "PASS",
		details: [],
		commands: [],
	};
}

/** A row that could not run: every column says so, and one line names the reason. */
export function skippedRow(
	capability: string,
	reason: string,
	findings: string[],
): {
	row: Row;
	findings: string[];
	broken: boolean;
} {
	const row = blankRow(capability);
	row.build = "SKIP";
	row.analysis = "SKIP";
	row.targets = "SKIP";
	row.tree = "SKIP";
	row.details.push(`skipped      ${reason}`);
	return { row, findings, broken: false };
}

/**
 * A failed configure that names an environment gap is a skip, never a finding against quarry: the
 * generator is listed by a cmake that has Visual Studio behind it, and a machine without the C++
 * toolset fails the configure instead.
 */
export function toolsetGuard(
	stderr: string,
	capability: string,
	findings: string[],
): { row: Row; findings: string[]; broken: boolean } | null {
	if (!toolsetMissing(stderr)) return null;
	return skippedRow(
		capability,
		`${NO_TOOLSET} — ${errorLines(stderr)[0] ?? "no stderr"}`,
		findings,
	);
}

/** The fixture's own build, which is the premise both rows rest on, run before the product is asked. */ export async function fixtureBuild(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
	row: Row,
): Promise<{ ok: boolean; stderr: string }> {
	harness.writeQuery(VS_BUILD_DIR);
	for (const args of fixture.userBuild ?? []) {
		const result = await harness.run("cmake", args, root);
		row.commands.push({
			line: `cd ${basename(root)} && cmake ${args.join(" ")}`,
			verdict: result.code === 0 ? "PASS" : "FAIL",
		});
		if (result.code !== 0) return { ok: false, stderr: result.stderr };
	}
	return { ok: true, stderr: "" };
}

/**
 * The worse of two column verdicts: one failing configuration fails the column, and a skip only
 * stands when nothing measured.
 */
export function worst(current: Verdict, next: Verdict): Verdict {
	if (current === "FAIL" || next === "FAIL") return "FAIL";
	if (next === "PASS") return "PASS";
	return current === "n/a" ? next : current;
}

/** The analysis both rows share: the product's clangd arguments, and the probes they must answer. */
export async function judgeAnalysis(
	fixture: Fixture,
	root: string,
	harness: WindowsHarness,
	row: Row,
	findings: string[],
	plan: Plan,
	/** Probes a caller adds for its own configuration, judged with the same clangd session. */
	extra: AnalysisProbe[] = [],
): Promise<Verdict> {
	const directory = basename(root);
	if (harness.clangd === null) {
		row.details.push(`analysis     SKIP  ${NO_CLANGD}`);
		return "SKIP";
	}
	const probes = [...fixture.probes, ...extra];
	const args = plan.handoff?.args ?? [];
	const product = harness.commandLine(["clangd", ...args]);
	const line = row.commands.length;
	row.commands.push({ line: `cd ${directory} && ${product}`, verdict: "PASS" });
	const measured = await harness.analyse(probes, args);
	let analysed = true;
	probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const diagnostics = measured[index]?.diagnostics ?? [];
		const ok = hover?.includes(probe.expect) ?? false;
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file} \`${probe.needle}\` -> ${hover === null ? "nothing" : JSON.stringify(hover.slice(0, 120))}${diagnostics.length > 0 ? `, with ${JSON.stringify(diagnostics[0].slice(0, 80))}` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok) {
			analysed = false;
			findings.push(
				`${directory}: the analysis cannot answer \`${probe.needle}\` in ${probe.file}, which needs ${probe.needs}. \`cd ${directory} && ${product}\` answers ${hover === null ? "nothing" : JSON.stringify(hover.slice(0, 120))}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}.`,
			);
		}
	});
	const verdict: Verdict = analysed ? "PASS" : "FAIL";
	row.commands[line].verdict = verdict;
	return verdict;
}
