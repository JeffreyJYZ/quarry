/**
 * The first two steps of a row that borrows a project's own build: run it, then check the
 * expectations the fixture's build guarantees before judging the product against them.
 */

import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Fixture } from "../fixtures/types";
import { analyse } from "../analysis";
import { describe, firstError } from "../format";
import { run } from "../process";
import { writeQuery } from "../project";
import type { Row } from "../types";

/**
 * The build the project already has: the fixture's own proof of life. A plain project has none to
 * borrow, so its own compile is written down and run as the standard its analysis is judged against.
 */
export async function fixtureOwnBuild(
	fixture: Fixture,
	root: string,
	cmake: string,
	row: Row,
): Promise<{ broken: boolean; userDb: string | null; userDbExists: boolean }> {
	const directory = basename(root);
	let broken = false;
	const plain = fixture.kind === "plain";
	if (plain) {
		for (const argv of fixture.plainBuild ?? []) {
			const result = await run(argv[0], argv.slice(1), root);
			row.commands.push({
				line: `cd ${directory} && ${argv.join(" ")}`,
				verdict: result.code === 0 ? "PASS" : "FAIL",
			});
			if (result.code !== 0) {
				broken = true;
				row.details.push(`fixture FAIL  ${argv.join(" ")}: ${firstError(result.stderr)}`);
			}
		}
	} else {
		writeQuery(root, dirname(fixture.userDb ?? "compile_commands.json"));
		for (const args of fixture.userBuild ?? []) {
			const result = await run(cmake, args, root);
			row.commands.push({
				line: `cd ${directory} && cmake ${args.join(" ")}`,
				verdict: result.code === 0 ? "PASS" : "FAIL",
			});
			if (result.code !== 0) {
				broken = true;
				row.details.push(
					`fixture FAIL  cmake ${args.join(" ")}: ${firstError(result.stderr)}`,
				);
			}
		}
	}
	const userDb = fixture.userDb === undefined ? null : join(root, fixture.userDb);
	const userDbExists = userDb !== null && existsSync(userDb);
	if (userDb !== null && !userDbExists && !fixture.dbOptional) {
		broken = true;
		row.details.push(`fixture FAIL  no ${fixture.userDb} after the CLion-shaped build`);
	}
	return { broken, userDb, userDbExists };
}

/**
 * The expectations are the fixture's own truth, so cross-check them against the database its build
 * wrote before judging the product's answer by them.
 */
export async function expectationsHold(
	fixture: Fixture,
	root: string,
	clangd: string,
	userDb: string | null,
	userDbExists: boolean,
	row: Row,
	broken: boolean,
): Promise<boolean> {
	if (userDb !== null && userDbExists) {
		const reference = await analyse(clangd, root, fixture.probes, [
			`--compile-commands-dir=${dirname(userDb)}`,
		]);
		fixture.probes.forEach((probe, index) => {
			const hover = reference[index]?.hover ?? null;
			if (hover === null || !hover.includes(probe.expect)) {
				broken = true;
				row.details.push(
					`fixture FAIL  ${probe.file} \`${probe.needle}\` does not answer ${JSON.stringify(probe.expect)} from ${fixture.userDb}: ${describe(hover)}`,
				);
			}
		});
	}
	return broken;
}
