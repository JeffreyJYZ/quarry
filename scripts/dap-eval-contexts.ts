/**
 * Which DAP `evaluate` context actually works on this machine, for C and for Rust.
 *
 * The spike recorded that `evaluate` fails for Rust (`Expression evaluation in Rust not supported`,
 * falling back to Objective-C++). The Evaluate field in the variables dock has to pick one default
 * context and has to report the adapter's own message when it fails, so the two facts it depends on
 * are measured here rather than assumed:
 *
 * 1. Every attempt either yields a non-empty value or a non-empty error message — never a silent
 *    empty success, which would leave the field blank with nothing to report.
 * 2. The context the UI defaults to (`DEFAULT_CONTEXT` below) returns a value on the C target.
 *
 * A Rust target that evaluates nothing is a recorded outcome, not a failure of this script; the
 * exact adapter message is printed and written into `docs/spikes/evaluate.md`.
 *
 * Usage: bun run scripts/dap-eval-contexts.ts
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The context `dap_evaluate` sends when the UI passes none. Change with `docs/spikes/evaluate.md`. */
const DEFAULT_CONTEXT = "watch";
const CONTEXTS = ["repl", "watch", "variables"] as const;

const C_SOURCE = `#include <stdio.h>

int add(int a, int b) {
	int sum = a + b;
	return sum;
}

int main(void) {
	int total = add(2, 3);
	printf("%d%\\n", total);
	return 0;
}
`;

const C_CMAKE = `cmake_minimum_required(VERSION 3.20)
project(probe C)
add_executable(probe main.c)
`;

const RUST_SOURCE = `use std::hint::black_box;

fn inspect(tag: u8) -> u64 {
	let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef];
	let s: String = String::from("quarry");
	let n: u32 = v.len() as u32;
	black_box((&v, &s, n, tag));
	black_box(n as u64 + tag as u64)
}

fn main() {
	let a = inspect(1);
	black_box(a);
	println!("{a}");
}
`;

type Json = Record<string, unknown>;

class DapClient {
	private readonly decoder = new TextDecoder();
	private buffer = "";
	private seq = 0;
	private readonly pending = new Map<number, (message: Json) => void>();
	private readonly events: Json[] = [];

	constructor(private readonly child: ReturnType<typeof Bun.spawn>) {
		void this.read();
	}

	private async read(): Promise<void> {
		const stream = this.child.stdout as ReadableStream<Uint8Array>;
		for await (const chunk of stream) {
			this.buffer += this.decoder.decode(chunk, { stream: true });
			this.drain();
		}
	}

	private drain(): void {
		for (;;) {
			const header = this.buffer.indexOf("\r\n\r\n");
			if (header < 0) return;
			const match = /Content-Length: (\d+)/i.exec(this.buffer.slice(0, header));
			if (match === null) return;
			const length = Number(match[1]);
			const start = header + 4;
			if (this.buffer.length < start + length) return;
			const body = this.buffer.slice(start, start + length);
			this.buffer = this.buffer.slice(start + length);
			const message = JSON.parse(body) as Json;
			if (message.type === "response") {
				const id = Number(message.request_seq);
				this.pending.get(id)?.(message);
				this.pending.delete(id);
			} else if (message.type === "event") {
				this.events.push(message);
			}
		}
	}

	send(command: string, args: Json = {}): Promise<Json> {
		this.seq += 1;
		const seq = this.seq;
		const payload = JSON.stringify({ seq, type: "request", command, arguments: args });
		const bytes = new TextEncoder().encode(
			`Content-Length: ${payload.length}\r\n\r\n${payload}`,
		);
		void (this.child.stdin as import("bun").FileSink).write(bytes);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`${command} timed out`)), 20_000);
			this.pending.set(seq, (message) => {
				clearTimeout(timer);
				if (message.success === false) {
					reject(new Error(String(message.message ?? "no message")));
					return;
				}
				resolve((message.body ?? {}) as Json);
			});
		});
	}

	/** The first event named `name` that arrived at or after index `from`. */
	async event(name: string, from: number): Promise<Json> {
		const deadline = Date.now() + 20_000;
		for (;;) {
			const found = this.events.slice(from).find((event) => event.event === name);
			if (found !== undefined) return found;
			if (Date.now() > deadline) throw new Error(`no ${name} event`);
			await Bun.sleep(20);
		}
	}

	get seen(): number {
		return this.events.length;
	}

	async stop(): Promise<void> {
		this.child.kill();
		await this.child.exited;
	}
}

type Target = {
	label: "c" | "rust";
	program: string;
	cwd: string;
	source: string;
	line: number;
	initCommands: string[];
	/** The expressions the dock would send, with the value each must produce under the default context. */
	expressions: Array<{ expression: string; expected: string }>;
};

type Outcome = {
	language: string;
	context: string;
	expression: string;
	value: string | null;
	type: string | null;
	message: string | null;
};

function rustToolchain(): { cargo: string; sysroot: string } {
	const home = process.env.HOME ?? "";
	const cargo = join(home, ".cargo", "bin", "cargo");
	const rustup = "/opt/homebrew/opt/rustup/bin/cargo";
	const cargoBin = Bun.which("cargo") ?? (existsSync(rustup) ? rustup : cargo);
	const sysrootRun = Bun.spawnSync([join(cargoBin, "..", "rustc"), "--print", "sysroot"]);
	const sysroot = sysrootRun.stdout.toString().trim();
	if (sysroot === "") throw new Error("no rustc sysroot");
	return { cargo: cargoBin, sysroot };
}

async function buildC(): Promise<Target> {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-eval-c-")));
	writeFileSync(join(dir, "main.c"), C_SOURCE);
	writeFileSync(join(dir, "CMakeLists.txt"), C_CMAKE);
	const build = join(dir, "build");
	await Bun.$`cmake -S ${dir} -B ${build} -DCMAKE_BUILD_TYPE=Debug`.quiet();
	await Bun.$`cmake --build ${build}`.quiet();
	return {
		label: "c",
		program: join(build, "probe"),
		cwd: dir,
		source: join(dir, "main.c"),
		// `int sum = a + b;` inside `add`, so `a` and `b` are live.
		line: 4,
		initCommands: [],
		expressions: [
			{ expression: "a", expected: "2" },
			{ expression: "a + b", expected: "5" },
		],
	};
}

async function buildRust(): Promise<Target> {
	const { cargo, sysroot } = rustToolchain();
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-eval-rust-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "eval-probe"\nversion = "0.1.0"\nedition = "2021"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, RUST_SOURCE);
	const build = Bun.spawnSync([cargo, "build", "--quiet"], {
		cwd: dir,
		env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}` },
	});
	if (build.exitCode !== 0) throw new Error(`cargo build failed:\n${build.stderr.toString()}`);
	const line = RUST_SOURCE.split("\n").findIndex((text) => text.includes("black_box((&v")) + 1;
	return {
		label: "rust",
		program: join(dir, "target", "debug", "eval-probe"),
		cwd: dir,
		source,
		line,
		initCommands: [
			`command script import ${join(sysroot, "lib", "rustlib", "etc", "lldb_lookup.py")}`,
		],
		expressions: [
			{ expression: "n", expected: "4" },
			{ expression: "n + 1", expected: "5" },
			// The rustup formatters are what make this a string rather than a raw struct.
			{ expression: "s", expected: '"quarry"' },
		],
	};
}

/** Stop on `target.line` and return the adapter, top frame id and thread id. */
async function stopOn(target: Target): Promise<{
	client: DapClient;
	frameId: number;
	threadId: number;
}> {
	const adapter =
		Bun.which("lldb-dap") ?? "/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap";
	const child = Bun.spawn([adapter], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
	const client = new DapClient(child);
	await client.send("initialize", {
		adapterID: "lldb",
		clientID: "quarry-eval-contexts",
		pathFormat: "path",
		linesStartAt1: true,
		supportsVariableType: true,
	});
	const before = client.seen;
	await client.send("launch", {
		program: target.program,
		args: [],
		cwd: target.cwd,
		stopOnEntry: false,
		terminal: "console",
		initCommands: target.initCommands,
	});
	await client.event("initialized", before);
	await client.send("setBreakpoints", {
		source: { name: target.source.split("/").pop() ?? "", path: target.source },
		breakpoints: [{ line: target.line }],
		sourceModified: false,
	});
	await client.send("configurationDone", {});
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const stopped = await client.event("stopped", before);
		const threadId = Number((stopped.body as Json | undefined)?.threadId ?? 0);
		const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 2 });
		const frames = (stack.stackFrames as Json[] | undefined) ?? [];
		const top = frames[0];
		const path = String((top?.source as Json | undefined)?.path ?? "");
		if (Number(top?.line) === target.line && path === target.source) {
			return { client, frameId: Number(top?.id ?? 0), threadId };
		}
		await client.send("continue", { threadId });
	}
	throw new Error(`${target.label}: never stopped on ${target.source}:${target.line}`);
}

/** One `evaluate`, shaped exactly as `dap_evaluate` sends it (frame id included). */
async function attempt(
	client: DapClient,
	frameId: number | null,
	expression: string,
	context: string | null,
): Promise<{ value: string | null; type: string | null; message: string | null }> {
	try {
		const args: Json = { expression };
		if (frameId !== null) args.frameId = frameId;
		if (context !== null) args.context = context;
		const body = await client.send("evaluate", args);
		const value = String(body.result ?? "");
		const type = body.type === undefined ? null : String(body.type);
		return { value, type, message: null };
	} catch (error) {
		return {
			value: null,
			type: null,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

async function measure(target: Target, outcomes: Outcome[]): Promise<void> {
	const { client, frameId } = await stopOn(target);
	const language = target.label;
	for (const context of [...CONTEXTS, "omitted"]) {
		const sent = context === "omitted" ? null : context;
		for (const { expression } of target.expressions) {
			const outcome = await attempt(client, frameId, expression, sent);
			outcomes.push({ language, context, expression, ...outcome });
		}
	}
	// The 2026-10-22 verdict of record came from requests that carried no `frameId`; keep measuring
	// that shape so the doc can say which half of the request the difference came from.
	for (const { expression } of target.expressions) {
		const outcome = await attempt(client, null, expression, DEFAULT_CONTEXT);
		outcomes.push({ language, context: "no-frame-id", expression, ...outcome });
	}
	await client.stop();
}

function cell(outcome: Outcome): string {
	const type = outcome.type === null ? "" : ` : ${outcome.type}`;
	if (outcome.value !== null) return `${outcome.value === "" ? "(empty)" : outcome.value}${type}`;
	return `error: ${outcome.message ?? "(no message)"}`;
}

async function main(): Promise<void> {
	const c = await buildC();
	const rust = await buildRust();
	const outcomes: Outcome[] = [];
	await measure(c, outcomes);
	await measure(rust, outcomes);

	for (const language of ["c", "rust"] as const) {
		console.log(`\n${language}`);
		for (const context of [...CONTEXTS, "omitted", "no-frame-id"]) {
			for (const outcome of outcomes.filter(
				(entry) => entry.language === language && entry.context === context,
			)) {
				console.log(
					`  ${context.padEnd(10)} ${outcome.expression.padEnd(6)} ${cell(outcome)}`,
				);
			}
		}
	}

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
	const targets: Target[] = [c, rust];
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

	console.log(`\ndefault context sent by the UI: ${DEFAULT_CONTEXT}`);
	console.log(`eval-contexts  verdict ${problems.length === 0 ? "PASS" : "FAIL"}`);
	for (const problem of problems) console.log(`  ${problem}`);
	process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error(`dap-eval-contexts: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
