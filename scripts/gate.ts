#!/usr/bin/env bun
/**
 * The whole gate in one place: frontend types, formatting, lint, tests, then the Rust equivalents.
 *
 * Every step runs even when an earlier one fails, so one invocation shows the complete picture
 * instead of one error at a time. Output from a passing step is discarded; a failing step prints its
 * last lines, and the summary names each step with its duration.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TAURI = join(ROOT, "src-tauri");

type Step = {
	name: string;
	command: string;
	args: string[];
	cwd?: string;
};

const STEPS: Step[] = [
	{ name: "types (bun check)", command: "bun", args: ["check"] },
	{ name: "format (bun fmt --check)", command: "bun", args: ["fmt", "--check"] },
	{ name: "lint (biome)", command: "bunx", args: ["biome", "lint", "."] },
	{ name: "frontend tests", command: "bun", args: ["test"] },
	{ name: "cargo fmt --check", command: "cargo", args: ["fmt", "--check"], cwd: TAURI },
	{
		name: "cargo check --all-targets",
		command: "cargo",
		args: ["check", "--all-targets"],
		cwd: TAURI,
	},
	{ name: "cargo test", command: "cargo", args: ["test"], cwd: TAURI },
	{
		name: "cargo clippy",
		command: "cargo",
		args: ["clippy", "--all-targets", "--", "-D", "warnings"],
		cwd: TAURI,
	},
];

const failures: { name: string; output: string }[] = [];
const line = (text: string) => console.log(text);

line("gate");

for (const step of STEPS) {
	const started = performance.now();
	let ok = true;
	let output = "";
	try {
		execFileSync(step.command, step.args, {
			cwd: step.cwd ?? ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch (error) {
		ok = false;
		const failure = error as { stdout?: string; stderr?: string; message?: string };
		output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim() || failure.message || "";
	}
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	line(`  ${ok ? "PASS" : "FAIL"}  ${step.name}  (${seconds}s)`);
	if (!ok) failures.push({ name: step.name, output });
}

if (failures.length > 0) {
	for (const failure of failures) {
		const lines = failure.output.split("\n").filter((entry) => entry.trim() !== "");
		const tail = lines.slice(-25).join("\n");
		line("");
		line(`--- ${failure.name} ---`);
		line(tail);
	}
	line("");
	line(`${failures.length} of ${STEPS.length} steps failed`);
	process.exit(1);
}

line(`all ${STEPS.length} steps passed`);
