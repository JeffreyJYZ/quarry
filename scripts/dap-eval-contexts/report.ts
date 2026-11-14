/**
 * The table, then the verdict: every expression must answer with a value or a message (never a
 * silent empty success), and the UI's default context must produce the expected value on both
 * targets.
 */

import { CONTEXTS, DEFAULT_CONTEXT, measure, measureOrder } from "./measure";
import type { Outcome, Target } from "./targets";
import { buildC, buildRust } from "./targets";

function cell(outcome: Outcome): string {
	const type = outcome.type === null ? "" : ` : ${outcome.type}`;
	if (outcome.value !== null) return `${outcome.value === "" ? "(empty)" : outcome.value}${type}`;
	return `error: ${outcome.message ?? "(no message)"}`;
}

function printTable(outcomes: Outcome[]): void {
	for (const language of ["c", "rust"] as const) {
		console.log(`\n${language}`);
		for (const context of [
			"no-frame-first",
			"frame-after-refusal",
			...CONTEXTS,
			"omitted",
			"no-frame-id",
			"syntax",
		]) {
			for (const outcome of outcomes.filter(
				(entry) => entry.language === language && entry.context === context,
			)) {
				console.log(
					`  ${context.padEnd(10)} ${outcome.expression.padEnd(6)} ${cell(outcome)}`,
				);
			}
		}
	}
}

function problemsFor(outcomes: Outcome[], targets: Target[]): string[] {
	const problems: string[] = [];
	for (const outcome of outcomes) {
		const silent =
			outcome.value === "" || (outcome.value === null && (outcome.message ?? "") === "");
		if (silent) {
			problems.push(
				`${outcome.language}/${outcome.context} "${outcome.expression}" answered neither value nor message`,
			);
		}
	}
	for (const target of targets) {
		for (const { expression, expected } of target.expressions) {
			const measured = outcomes.find(
				(outcome) =>
					outcome.language === target.label &&
					outcome.context === DEFAULT_CONTEXT &&
					outcome.expression === expression,
			);
			if (measured === undefined || measured.value !== expected) {
				problems.push(
					`the UI default context ${DEFAULT_CONTEXT} did not evaluate ${target.label} "${expression}" to ${expected} (got ${measured === undefined ? "nothing" : cell(measured)})`,
				);
			}
		}
	}
	return problems;
}

export async function runProbe(): Promise<void> {
	const c = await buildC();
	const rust = await buildRust();
	const outcomes: Outcome[] = [];
	const targets: Target[] = [c, rust];
	for (const target of targets) {
		await measureOrder(target, outcomes);
		await measure(target, outcomes);
	}

	printTable(outcomes);
	const problems = problemsFor(outcomes, targets);

	console.log(`\ndefault context sent by the UI: ${DEFAULT_CONTEXT}`);
	console.log(`eval-contexts  verdict ${problems.length === 0 ? "PASS" : "FAIL"}`);
	for (const problem of problems) console.log(`  ${problem}`);
	process.exit(problems.length === 0 ? 0 : 1);
}
