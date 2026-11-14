/**
 * The report: the capability × consumer table, one section per row's details, the findings, every
 * command that was run, and the line CI reads.
 */

import type { Row } from "./types";

/** Why the Xcode row is skipped off macOS, in one line a reader can act on. */
export const XCODE_MACOS_ONLY =
	"the Xcode generator is macOS-only: this runner's cmake has no Xcode project layout to write, and nothing here can read one — run the probe on macOS for that row";

/** A row nobody measured, with the reason in its first cell's own column. */
export function skipped(capability: string, reason: string): Row {
	return {
		capability,
		build: "SKIP",
		analysis: "SKIP",
		targets: "SKIP",
		tree: "SKIP",
		details: [`skipped      ${reason}`],
		commands: [],
	};
}

/** Print the table, the findings and every command, then exit with the probe's own code. */
export function report(
	rows: Row[],
	findings: string[],
	broken: boolean,
	started: number,
): never | void {
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
