/**
 * The two readings, side by side: clangd started bare, then clangd started the way `lsp/handoff`
 * starts it.
 *
 * A bare clangd in this project's root does not find `cmake-build-debug/` — it searches `build/` —
 * so the header is unresolved; the handed-off run is given the database directory and the compiler
 * to query, and must come back clean with the extern declaration resolved.
 */

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileUri } from "../lsp-client";
import { analyse } from "./analyse";
import { buildProject } from "./build";
import { HOVER_TOKEN, writeProject } from "./fixture";
import { productFlags } from "./flags";

export interface ProbeReport {
	lines: string[];
	failures: string[];
}

export async function runProbe(root: string): Promise<ProbeReport> {
	let project: string | null = null;
	const lines: string[] = ["clangd CMake hand-off — quarry"];
	const failures: string[] = [];

	try {
		if (spawnSync("clangd", ["--version"], { stdio: "ignore" }).status !== 0) {
			throw new Error("clangd is not on PATH");
		}
		const flags = productFlags(root);
		lines.push(`  flags       ${flags.dir} ${flags.driver} (from src/lsp/handoff/compose.rs)`);

		project = writeProject();
		const built = buildProject(project);
		lines.push("  build       cmake configure + build accepted the code");
		lines.push(`  database    ${built.database}`);
		lines.push(`  compiler    ${built.compiler}`);

		const source = join(project, "src/main.cpp");
		const uri = fileUri(source);

		const before = await analyse("clangd", project, [], source, uri);
		lines.push(`  before      ${before.errors} error(s) — ${before.said}`);

		const after = await analyse(
			"clangd",
			project,
			[`${flags.dir}=${built.buildDir}`, `${flags.driver}=${built.compiler}`],
			source,
			uri,
		);
		lines.push(`  after       ${after.errors} error(s) — ${after.said}`);
		lines.push(
			`  hover       ${after.hover.includes(HOVER_TOKEN) ? `${HOVER_TOKEN} resolved` : "NOT RESOLVED"}`,
		);

		if (after.errors !== 0) {
			failures.push(`the handed-off run reported ${after.errors} error(s): ${after.said}`);
			const said = after.stderr.trim().split("\n").slice(-3).join(" | ");
			if (said !== "") lines.push(`  stderr      ${said}`);
		}
		if (!after.hover.includes(HOVER_TOKEN)) {
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
	return { lines, failures };
}
