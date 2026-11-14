/**
 * Running one capability and printing the one line the console shows while it happens.
 *
 * The four families of row — a borrowed build, a project that judges itself, a second toolchain, a
 * Windows generator — differ only in how they are asked; the line between them is the same.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Row } from "./types";

/** A fixture's directory: its capability label, with the characters a path cannot carry replaced. */
export function fixtureRoot(tempRoot: string, name: string): string {
	const root = join(tempRoot, name.replace(/[/: ]+/g, "-"));
	mkdirSync(root, { recursive: true });
	return root;
}

export async function runRow(
	name: string,
	work: () => Promise<{ row: Row; findings: string[]; broken: boolean }>,
): Promise<{ row: Row; findings: string[]; broken: boolean }> {
	process.stdout.write(`running ${name} … `);
	const judged = await work();
	console.log(
		`build ${judged.row.build} · analysis ${judged.row.analysis} · targets ${judged.row.targets} · tree ${judged.row.tree}`,
	);
	return judged;
}
