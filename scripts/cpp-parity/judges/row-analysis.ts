/**
 * The analysis half of a row that borrows a project's own build: clangd started with exactly the
 * arguments the product composes, judged at the positions the fixture's build guarantees.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { analyse, positionOf } from "../analysis";
import type { Fixture } from "../fixtures/types";
import { commandLine, describe } from "../format";
import { relativeTo } from "../paths";
import type { Plan, Row, Verdict } from "../types";

export async function analyseProject(
	fixture: Fixture,
	root: string,
	clangd: string,
	openedPlan: Plan,
	userDb: string | null,
	userDbExists: boolean,
	row: Row,
	findings: string[],
	broken: boolean,
): Promise<Verdict> {
	const directory = basename(root);
	const relative = (path: string) => relativeTo(root, path);
	const handoffArgs = openedPlan.handoff?.args ?? [];
	const clangdCommand = commandLine(root, ["clangd", ...handoffArgs]);
	const clangdLine = row.commands.length;
	row.commands.push({
		line: `cd ${directory} && ${clangdCommand}`,
		verdict: "PASS",
	});
	const measured = await analyse(clangd, root, fixture.probes, handoffArgs);
	fixture.probes.forEach((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		const ok = hover?.includes(probe.expect) ?? false;
		const text = readFileSync(join(root, probe.file), "utf8");
		const position = positionOf(text, probe.needle);
		row.details.push(
			`analysis     ${ok ? "PASS" : "FAIL"}  ${probe.file}:${position.line + 1}:${position.character + 1} \`${probe.needle}\` -> ${describe(hover)} (wants ${JSON.stringify(probe.expect)})`,
		);
		if (!ok && !broken) {
			const evidence = measured[index]?.diagnostics ?? [];
			const database = openedPlan.handoff?.databaseDir ?? null;
			const namedFixtureDb = userDb !== null && database === dirname(userDb);
			const elsewhere =
				userDb !== null && userDbExists && !namedFixtureDb
					? `, though ${fixture.userDb} exists and records the flags the build used`
					: "";
			findings.push(
				`${directory}: the analysis cannot answer at ${probe.file}:${position.line + 1}:${position.character + 1}, which needs ${probe.needs}. \`cd ${directory} && ${clangdCommand}\` answers ${describe(hover)}${
					evidence.length > 0 ? `, with "${evidence[0]}"` : ""
				}; the plan named ${database === null ? "no compile database" : relative(database)}${elsewhere}. The fixture's own build guarantees ${JSON.stringify(probe.expect)}.`,
			);
		}
	});
	const verdict: Verdict = fixture.probes.every((probe, index) => {
		const hover = measured[index]?.hover ?? null;
		return hover?.includes(probe.expect) === true;
	})
		? "PASS"
		: "FAIL";
	row.commands[clangdLine].verdict = verdict;
	return verdict;
}
