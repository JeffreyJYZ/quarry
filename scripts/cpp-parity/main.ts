/**
 * The probe's own run: which tools this machine has, which rows it can measure, and in what order.
 *
 * A row is either a project that borrows its own build, a capability that judges itself, a second
 * toolchain, or a Windows generator; each is asked here, in the order the report reads, and the
 * report is printed once at the end.
 */

import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Fixture } from "./fixtures/types";
import {
	gccLauncherFixture,
	gccToolchainFixture,
	generatorFixture,
	mixedLanguagesFixture,
	multiConfigFixture,
	multiTargetFixture,
	plainFixture,
	presetsFixture,
	profileFixture,
	systemHeaderFixture,
	toolchainFixture,
	twoTargetsFixture,
} from "./fixtures";
import { firstLine } from "./format";
import { findGcc, NO_GCC } from "./gcc";
import { gccHarness } from "./gcc-harness";
import { judgeGccToolchain } from "./judges/gcc-row";
import { judgeMixedLanguages } from "./judges/mixed";
import { judgeMultiConfig } from "./judges/multi-config";
import { judgeProfile } from "./judges/profile";
import { judge } from "./judges/row";
import { judgeOneTarget } from "./judges/two-targets";
import { planner } from "./plan";
import { findTool, run } from "./process";
import { report, skipped, XCODE_MACOS_ONLY } from "./report";
import { fixtureRoot, runRow } from "./run-row";
import { seamFacts } from "./seam";
import type { Row } from "./types";
import { NO_CLANGD, NO_VS } from "./windows";
import { visualStudio, windowsRows } from "./windows-rows";

/** How a capability that judges itself is asked: the fixture, its root, and the probe's tools. */
type Judge = (
	fixture: Fixture,
	root: string,
	plannerBin: string,
	cmake: string,
	clangd: string,
) => Promise<{ row: Row; findings: string[]; broken: boolean }>;

export async function main(): Promise<void> {
	const started = Date.now();
	const windowsOnly = process.argv.includes("--windows");
	// The Linux subset: the rows a Linux runner can answer. It is a subset rather than a default
	// because two of them are toolchain-specific and only one platform has each — an Xcode
	// generator, a Visual Studio generator — and naming that difference is what the table is for.
	const linuxOnly = process.argv.includes("--linux");
	const cmake = findTool("cmake");
	const clangd = findTool("clangd");
	if (!cmake) throw new Error("cmake is not installed");
	// The second toolchain is optional: a machine without one gets this row skipped by name.
	const gcc = windowsOnly ? null : findGcc();

	const generators = (await run(cmake, ["--help"], process.cwd())).stdout;

	// Canonical, because the product reports canonical paths (`/private/var` over `/var`) and every
	// relative path in this report is measured against this root.
	const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "quarry-cpp-parity-")));

	const plannerBin = await planner();
	console.log("C/C++ parity probe — quarry");
	console.log(`  subset    ${windowsOnly ? "Windows" : linuxOnly ? "Linux" : "all rows"}`);
	console.log(`  fixtures  ${tempRoot}`);
	console.log(`  planner   ${plannerBin}`);
	console.log(`  cmake     ${firstLine((await run(cmake, ["--version"], tempRoot)).stdout)}`);
	if (clangd === null) console.log(`  clangd    ${NO_CLANGD}`);
	else
		console.log(
			`  clangd    ${firstLine((await run(clangd, ["--version"], tempRoot)).stdout)}`,
		);
	console.log(`  gcc       ${gcc === null ? NO_GCC : gcc.version}`);
	let broken = false;
	for (const fact of seamFacts()) {
		console.log(`  drift     ${fact}`);
		broken = true;
	}

	// Which Visual Studio generator this machine has is discovered, never assumed: `cmake --help`
	// lists what this cmake supports, and an image can list a generator whose instance is absent.
	const vs = await visualStudio(cmake, generators, tempRoot);
	for (const line of vs.attempts) console.log(`  vs        ${line}`);
	if (vs.candidates.length > 0 && vs.generator === null) console.log(`  vs        ${NO_VS}`);

	// The Windows subset is the two rows a Visual Studio generator and MSVC can measure. It is the
	// whole run there: the other rows are macOS toolchains and would only say "no clang++" eight
	// times over.
	if (windowsOnly) {
		const measured = await windowsRows(tempRoot, plannerBin, clangd, vs);
		return report(measured.rows, measured.findings, measured.broken || broken, started);
	}
	if (clangd === null) throw new Error("clangd is not installed");

	const rows: Row[] = [];
	const findings: string[] = [];

	// A row this platform cannot measure says so in the table, by name and with a reason. Xcode is
	// the one generator with no Linux build, and an absent row reading as "not applicable" is the
	// silent skip this table exists to replace.
	if (linuxOnly) {
		console.log(`skipping generator: Xcode … ${XCODE_MACOS_ONLY}`);
		rows.push(skipped("generator: Xcode", XCODE_MACOS_ONLY));
	}

	const fixtures: Fixture[] = [presetsFixture(), toolchainFixture(), multiTargetFixture()];
	// Gated on the subset rather than only on `cmake --help`: a Linux runner must not configure an
	// Xcode project even if some cmake there listed the generator, because nothing else on it can
	// read the tree that generator writes.
	if (!linuxOnly && generators.includes("Xcode")) {
		fixtures.push(generatorFixture("generator: Xcode", "Xcode"));
	}
	if (generators.includes("Ninja Multi-Config")) {
		fixtures.push(generatorFixture("generator: Ninja Multi-Config", "Ninja Multi-Config"));
	}
	fixtures.push(systemHeaderFixture());
	// Last, so the table shows the one project with no build system to borrow a database from.
	fixtures.push(plainFixture());

	for (const fixture of fixtures) {
		const root = fixtureRoot(tempRoot, fixture.name);
		const judged = await runRow(fixture.name, () =>
			judge(fixture, root, plannerBin, cmake, clangd),
		);
		rows.push(judged.row);
		findings.push(...judged.findings);
		broken = broken || judged.broken;
	}

	// Capabilities with no shared consumer: a mixed-language plain project, a profile that reaches
	// the compiler, a build that names one target, and a multi-config tree built twice. Each judges
	// itself, because the columns the other rows measure say nothing about it.
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
		const root = fixtureRoot(tempRoot, extra.fixture.name);
		const result = await runRow(extra.fixture.name, () =>
			extra.judged(extra.fixture, root, plannerBin, cmake, clangd),
		);
		rows.push(result.row);
		findings.push(...result.findings);
		broken = broken || result.broken;
	}

	// The second toolchain, last: a compiler clangd does not recognise, so either this machine has
	// one or the row says why it could not run. The second row puts that compiler behind a launcher,
	// which is the shape a `ccache` tree has and the one a hand-off can mistake for the driver.
	const gccFixtures = gcc === null ? [] : [gccToolchainFixture(gcc), gccLauncherFixture(gcc)];
	if (gcc === null) {
		for (const capability of ["toolchain: gcc", "toolchain: gcc behind a launcher"]) {
			console.log(`skipping ${capability} … ${NO_GCC}`);
			rows.push(skipped(capability, NO_GCC));
		}
	} else {
		for (const fixture of gccFixtures) {
			const root = fixtureRoot(tempRoot, fixture.name);
			const harness = gccHarness(root, fixture, plannerBin, clangd);
			const result = await runRow(fixture.name, () =>
				judgeGccToolchain(fixture, root, gcc, harness),
			);
			rows.push(result.row);
			findings.push(...result.findings);
			broken = broken || result.broken;
		}
	}

	// The Windows rows run everywhere they can: on a machine without the generator each says so by
	// name, which is the whole point of a row that cannot pass by being absent.
	const measured = await windowsRows(tempRoot, plannerBin, clangd, vs);
	rows.push(...measured.rows);
	findings.push(...measured.findings);
	broken = broken || measured.broken;

	report(rows, findings, broken, started);
}
