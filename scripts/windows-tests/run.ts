/**
 * The parts both platform modes share: the `quarry-tests` binary, the lines a row prints, and the
 * exit code its findings decide.
 */

import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { Row } from "./row";
import { firstError, run } from "./tools";

const MANIFEST = join(import.meta.dir, "..", "..", "src-tauri");

/** The `quarry-tests` binary, built here unless a caller already built it. */
export async function productBinary(): Promise<string> {
	const override = process.env.QUARRY_TESTS_BIN;
	if (override !== undefined && override !== "") {
		const resolved = resolvePath(override);
		if (!existsSync(resolved)) throw new Error(`QUARRY_TESTS_BIN is not a file: ${resolved}`);
		return resolved;
	}
	const result = await run(
		"cargo",
		["build", "--example", "quarry-tests", "--message-format=json"],
		MANIFEST,
		900_000,
	);
	for (const line of result.stdout.split(/\r?\n/)) {
		if (!line.trim().startsWith("{")) continue;
		try {
			const message = JSON.parse(line);
			if (message.reason === "compiler-artifact" && message.target?.name === "quarry-tests") {
				if (typeof message.executable === "string" && existsSync(message.executable)) {
					return message.executable;
				}
			}
		} catch {
			// cargo prints non-JSON lines too; the artifact line is the one this needs.
		}
	}
	throw new Error(
		`cargo build --example quarry-tests exited ${result.code}: ${firstError(result.stderr)}`,
	);
}

/** One row as the report shows it, with the command that failed. */
export function printRow(row: Row): void {
	console.log(`  ${row.verdict}  ${row.capability}`);
	for (const detail of row.details) console.log(`            ${detail}`);
	for (const command of row.commands) {
		if (command.verdict === "PASS") continue;
		console.log(`      !     ${command.line}`);
		if (command.detail !== "") console.log(`            ${command.detail}`);
	}
}

/**
 * The rows' findings and the run's exit code: 2 when a fixture or the seam is broken, 1 when a row
 * found a product defect, 0 when every row that ran passed.
 */
export function conclusion(rows: Row[]): number {
	const findings = rows.flatMap((row) => row.findings);
	if (findings.length > 0) {
		console.log("");
		console.log("findings");
		for (const finding of findings) console.log(`  - ${finding}`);
	}
	const failed = rows.filter((row) => row.verdict !== "PASS").length;
	if (rows.some((row) => row.broken)) return 2;
	return failed === 0 ? 0 : 1;
}
