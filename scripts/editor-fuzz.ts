#!/usr/bin/env bun
/**
 * Repeats the editor dispatch hunt.
 *
 * `bun scripts/editor-fuzz.ts` sweeps seeds 1..200; `--seeds=5000`, `--from=200`, `--length=30` and
 * `--seed=7` change the sweep. Every seed is printed by number, so a failure can be replayed with
 * `--seed=<n>`. A failing seed prints the exact steps, the document each starts from and the thrown
 * message; the exit code is 1 when anything broke.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { type Step, applyStep, check, createView, runSeed } from "@/lib/editor/dispatchFuzz";

if (typeof document === "undefined") GlobalRegistrator.register();
const host = document.createElement("div");
document.body.appendChild(host);

const args = new Map(
	Bun.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"] as const;
	}),
);
const from = Number(args.get("from") ?? 1);
const seeds = Number(args.get("seeds") ?? 200);
const length = Number(args.get("length") ?? 14);
const single = args.get("seed");

/** Whether one step alone, from a fresh view at `doc`, still breaks an invariant. */
function alone(doc: string, step: Step): string | null {
	const sink: unknown[] = [];
	const view = createView(host, doc, sink);
	try {
		applyStep(view, step);
		check(view, step, new Set([doc]), sink);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	} finally {
		view.destroy();
	}
}

function report(seed: number): boolean {
	const run = runSeed(seed, host, length);
	if (run.violation === null) {
		if (single !== undefined)
			console.log(`seed ${seed}: ${run.steps.length} steps, no violation`);
		return true;
	}
	const { doc, step, error } = run.violation;
	console.log(`\nseed ${seed} FAILED after ${run.steps.length} steps: ${error}`);
	console.log(`  document: ${JSON.stringify(doc)} (${doc.length} chars)`);
	console.log(`  failing step: ${JSON.stringify(step)}`);
	for (const [index, earlier] of run.steps.slice(0, -1).entries()) {
		console.log(`  step ${index}: ${JSON.stringify(earlier)}`);
	}
	const solo = alone(doc, step);
	console.log(
		solo === null
			? "  needs the preceding steps; the full prefix above is the minimal sequence found"
			: `  one step alone reproduces it: ${solo}`,
	);
	return false;
}

const started = performance.now();
let broken = 0;
if (single !== undefined) {
	if (!report(Number(single))) broken += 1;
} else {
	for (let seed = from; seed < from + seeds; seed += 1) {
		if (report(seed)) continue;
		broken += 1;
	}
}
const seconds = ((performance.now() - started) / 1000).toFixed(2);

if (broken > 0) {
	console.log(
		`\n${broken} failing seed(s); replay one with bun scripts/editor-fuzz.ts --seed=<n>`,
	);
	process.exit(1);
}
const label = single === undefined ? `seeds ${from}..${from + seeds - 1}` : `seed ${single}`;
console.log(`${label}: no violation in ${seconds}s`);
