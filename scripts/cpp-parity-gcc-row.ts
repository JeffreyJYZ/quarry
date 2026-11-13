#!/usr/bin/env bun
/**
 * The `toolchain: gcc` parity rows: a project built by a compiler clangd does not recognise, and the
 * same project with that compiler behind a launcher.
 *
 * Every other row uses the platform's clang, whose headers clangd finds by itself. A CLion user's
 * second toolchain is Homebrew GCC, named by the toolchain file the preset selects, and clangd
 * cannot guess that compiler's libstdc++ paths: the hand-off has to name the driver with
 * `--query-driver`, or the analysis silently reads libc++'s headers instead.
 *
 * What the plan and the tree say about the toolchain is measured in `cpp-parity-gcc-evidence.ts`.
 * This module runs them: the plan's configure and build exactly as reported, then its clangd
 * arguments, then the program. It also makes one control run of its own — the same clangd with no
 * `--query-driver` — because a fixture that passes either way no longer measures anything, and that
 * is a probe defect rather than a product finding.
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { GCC_STDOUT } from "./cpp-parity-fixtures";
import type { Fixture } from "./cpp-parity-fixtures";
import type { Row } from "./cpp-parity-probe";
import { databaseEvidence, handoffEvidence, treeEvidence } from "./cpp-parity-gcc-evidence";
import type { GccHarness, GccToolchain } from "./cpp-parity-gcc";

/**
 * One row judged end to end, from the plan to the running program.
 *
 * `fixture` is the GCC project, `gcc` the toolchain it was written for, and `harness` the probe's
 * own plan asker, process runner and clangd session — so this module measures the product with the
 * probe's machinery instead of re-implementing either.
 */
export async function judgeGccToolchain(
	fixture: Fixture,
	root: string,
	gcc: GccToolchain,
	harness: GccHarness,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	const directory = basename(root);
	const shown = (path: string) => path.replace(`${root}/`, "");
	harness.writeFixture();
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
	let configured = true;

	const plan = await harness.ask();
	row.commands.push({
		line: `cd ${directory} && quarry-plan .`,
		verdict: plan.cmake ? "PASS" : "FAIL",
	});
	const section = plan.cmake;
	if (!section) {
		broken = true;
		row.details.push("fixture FAIL  the product reports no CMake plan for this project");
		return { row, findings, broken };
	}

	// 1. The plan configures through the fixture's own preset, which is what names the toolchain.
	const preset = section.configure.includes("--preset") && section.configure.includes("debug");
	row.details.push(
		`plan         ${preset ? "PASS" : "FAIL"}  configure: ${harness.commandLine(section.configure)}`,
	);
	if (!preset) {
		configured = false;
		findings.push(
			`${directory}: the plan must configure through the fixture's \`debug\` preset, because that preset is what names the GCC toolchain file, but it runs ${harness.commandLine(section.configure)}.`,
		);
	}

	// 2. The configure and build the plan reports, run exactly as reported.
	const program = section.program ?? "cmake";
	const configure = await harness.run(program, section.configure.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.configure)}`,
		verdict: configure.code === 0 ? "PASS" : "FAIL",
	});
	if (configure.code !== 0) {
		broken = true;
		const reason = harness.firstError(configure.stderr);
		row.details.push(`fixture FAIL  configure exited ${configure.code}: ${reason}`);
		return { row, findings, broken };
	}
	const built = await harness.run(program, section.build.slice(1), section.cwd);
	row.commands.push({
		line: `cd ${directory} && ${harness.commandLine(section.build)}`,
		verdict: built.code === 0 ? "PASS" : "FAIL",
	});
	if (built.code !== 0) {
		broken = true;
		const reason = harness.firstError(built.stderr);
		row.details.push(`fixture FAIL  build exited ${built.code}: ${reason}`);
		return { row, findings, broken };
	}

	// 3. What the tree, the database and the hand-off say: GCC, and clangd told to query it. The
	//    first two are the build's own facts; the third is the analysis's, so each fails its column.
	//    A fixture configured behind a launcher names that launcher first in both records, which is
	//    the shape the hand-off has to see through.
	const tree = section.buildRoot;
	const launcherFile = fixture.executables?.[0];
	const launcher = launcherFile === undefined ? null : join(root, launcherFile);
	const facts = [
		treeEvidence(tree, gcc, root, launcher),
		databaseEvidence(tree, gcc, root, harness.compileArguments, launcher),
	];
	const handoff = handoffEvidence(tree, gcc, plan, root);
	for (const part of [...facts, handoff]) {
		row.details.push(...part.details);
		findings.push(...part.findings);
	}
	configured = preset && facts.every((part) => part.ok);

	// 4. Analysis with exactly the arguments the product composes.
	const clangdLine = row.commands.length;
	const product = harness.commandLine(["clangd", ...(plan.handoff?.args ?? [])]);
	row.commands.push({ line: `cd ${directory} && ${product}`, verdict: "PASS" });
	const measured = await harness.analyse(fixture.probes, plan.handoff?.args ?? []);
	let analysed = true;
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const diagnostics = measured[index]?.diagnostics ?? [];
		const ok = (hover?.includes(probe.expect) ?? false) && diagnostics.length === 0;
		const found = hover === null ? "nothing" : JSON.stringify(hover.slice(0, 120));
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file} \`${probe.needle}\`: ${found}${diagnostics.length > 0 ? `, with ${JSON.stringify(diagnostics[0])}` : ", no diagnostics"} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok) {
			analysed = false;
			findings.push(
				`${directory}: the analysis cannot answer \`${probe.needle}\` in ${probe.file}, which needs ${probe.needs}. \`cd ${directory} && ${product}\` answers ${found}${diagnostics.length > 0 ? `, with "${diagnostics[0]}"` : ""}.`,
			);
		}
	});
	row.analysis = analysed && handoff.ok ? "PASS" : "FAIL";
	row.commands[clangdLine].verdict = row.analysis;

	const control = await harness.analyse(fixture.probes, [`--compile-commands-dir=${tree}`]);
	const blind = control.some((measurement, index) => {
		const hover = measurement.hover ?? "";
		const wanted = fixture.probes[index]?.expect ?? "";
		return !hover.includes(wanted) || measurement.diagnostics.length > 0;
	});
	if (blind) {
		row.details.push(
			"control      PASS  without --query-driver the same clangd cannot read GCC's standard header",
		);
	} else {
		broken = true;
		row.details.push(
			"control      FAIL  the same clangd answers without --query-driver, so this fixture cannot tell a queried driver from an unqueried one",
		);
	}

	// 5. The build's own result: the target the dropdown names, and the program it runs.
	const after = await harness.ask();
	const artifact = after.targets[0]?.program ?? null;
	const exists = artifact !== null && harness.isFile(artifact);
	row.targets = exists ? "PASS" : "FAIL";
	row.commands.push({
		line: `cd ${directory} && ls -l ${artifact === null ? "(no target)" : basename(artifact)}`,
		verdict: exists ? "PASS" : "FAIL",
	});
	if (!exists) {
		findings.push(
			`${directory}: the target list names ${artifact ?? "no program"} after the build, and nothing is at that path — \`cd ${directory} && ls -l ${shown(tree)}\`.`,
		);
	}
	const executed = artifact === null ? null : await harness.run(artifact, [], root);
	const prints = executed !== null && executed.code === 0 && executed.stdout.includes(GCC_STDOUT);
	if (artifact !== null) {
		row.commands.push({
			line: `cd ${directory} && ./${basename(artifact)}`,
			verdict: prints ? "PASS" : "FAIL",
		});
	}
	if (!prints) {
		const printed = executed === null ? "nothing" : JSON.stringify(executed.stdout.trim());
		findings.push(
			`${directory}: the built program ${artifact === null ? "is unset" : basename(artifact)} printed ${printed} (exit ${executed?.code ?? "none"}) and ${GCC_STDOUT} was wanted — \`cd ${directory} && ${shown(tree)}/parity_gcc\`.`,
		);
	}
	row.build = configured && prints ? "PASS" : "FAIL";
	if (existsSync(join(root, "CMakeCache.txt"))) {
		row.tree = "FAIL";
		findings.push(
			`${directory}: a configure wrote CMakeCache.txt into the source directory — \`cd ${directory} && ls CMakeCache.txt\`.`,
		);
	}
	return { row, findings, broken };
}
