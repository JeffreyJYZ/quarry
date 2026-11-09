#!/usr/bin/env bun
/**
 * The whole gate in one place: frontend types, formatting, lint, tests, and the Rust equivalents.
 *
 * Two lanes run at once — the frontend checks and the cargo chain — because they touch different
 * toolchains and neither waits on the other. Inside a lane everything is sequential: cargo holds the
 * target directory lock, so two cargo steps in flight only queue.
 *
 * Every step runs even when an earlier one fails, so one invocation shows the complete picture
 * instead of one error at a time. Output from a passing step is discarded; a failing step prints its
 * last lines, and the summary names each step.
 *
 * `cargo check --all-targets` is not a step: clippy typechecks every target and then lints it, so a
 * separate check pass bought a second compile and nothing else.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TAURI = join(ROOT, "src-tauri");

type Step = {
	name: string;
	command: string;
	args: string[];
	cwd?: string;
};

const FRONTEND: Step[] = [
	{ name: "file size (200 lines)", command: "bun", args: ["scripts/check-file-size.ts"] },
	{ name: "types (bun check)", command: "bun", args: ["check"] },
	{ name: "docs dependencies", command: "bun", args: ["scripts/docs-deps.ts"] },
	{ name: "unstyled classes", command: "bun", args: ["scripts/unstyled-classes.ts"] },
	{ name: "format (bun fmt --check)", command: "bun", args: ["fmt", "--check"] },
	{ name: "lint (biome)", command: "bunx", args: ["biome", "lint", "."] },
	{ name: "frontend tests", command: "bun", args: ["test"] },
];

const RUST: Step[] = [
	{ name: "cargo fmt --check", command: "cargo", args: ["fmt", "--check"], cwd: TAURI },
	/**
	 * `cargo nextest` when it is installed, plain `cargo test` otherwise.
	 *
	 * nextest runs the same tests with its own parallel runner and skips the doc-test compile this
	 * crate does not use: measured with one crate rebuild, 6.99s against 4.95s. The fallback keeps a
	 * fresh checkout and CI working without an extra install, and the step name says which ran.
	 */
	Bun.which("cargo-nextest") === null
		? { name: "cargo test", command: "cargo", args: ["test"], cwd: TAURI }
		: { name: "cargo nextest", command: "cargo", args: ["nextest", "run"], cwd: TAURI },
	{
		name: "cargo clippy",
		command: "cargo",
		args: ["clippy", "--all-targets", "--", "-D", "warnings"],
		cwd: TAURI,
	},
];

const failures: { name: string; output: string }[] = [];
const line = (text: string) => console.log(text);
const total = FRONTEND.length + RUST.length;

function run(step: Step): Promise<void> {
	return new Promise((resolve) => {
		const started = performance.now();
		execFile(
			step.command,
			step.args,
			{
				cwd: step.cwd ?? ROOT,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			},
			(error, stdout, stderr) => {
				const seconds = ((performance.now() - started) / 1000).toFixed(1);
				line(`  ${error === null ? "PASS" : "FAIL"}  ${step.name}  (${seconds}s)`);
				if (error !== null) {
					const output = `${stdout}${stderr}`.trim() || error.message;
					failures.push({ name: step.name, output });
				}
				resolve();
			},
		);
	});
}

async function lane(steps: Step[]): Promise<void> {
	for (const step of steps) await run(step);
}

line("gate");

await Promise.all([lane(FRONTEND), lane(RUST)]);

if (failures.length > 0) {
	for (const failure of failures) {
		const lines = failure.output.split("\n").filter((entry) => entry.trim() !== "");
		const tail = lines.slice(-25).join("\n");
		line("");
		line(`--- ${failure.name} ---`);
		line(tail);
	}
	line("");
	line(`${failures.length} of ${total} steps failed`);
	process.exit(1);
}

line(`all ${total} steps passed`);
