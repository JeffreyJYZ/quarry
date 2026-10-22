#!/usr/bin/env bun
// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUEST_TIMEOUT_MS = 20_000;
const EVENT_TIMEOUT_MS = 20_000;
const KNOWN_BYTES = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
const CARGO_GUESS = "/opt/homebrew/opt/rustup/bin/cargo";
const MAIN_RS = `use std::hint::black_box;

static mut COUNTER: u32 = 0;

fn inspect(tag: u8) -> u64 {
    let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
    let s: String = String::from("quarry");
    let o: Option<u32> = Some(1234);
    let raw: *const u8 = v.as_ptr();
    let n: u32 = v.len() as u32;
    unsafe { COUNTER += n; }
    black_box((&v, &s, &o, raw, n, tag));
    let sum = black_box(unsafe { *raw } as u64 + n as u64 + tag as u64);
    sum
}

fn main() {
    let a = inspect(1);
    let b = inspect(2);
    black_box(a + b);
    println!("{a} {b}");
}
`;

type Json = Record<string, unknown>;
class DapError extends Error {}
class DapClient {
	private child: any;
	private buffer = Buffer.alloc(0);
	private seq = 1;
	private pending = new Map<
		number,
		{
			command: string;
			resolve: (b: Json) => void;
			reject: (e: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private eventQueue: Array<{ event: string; body?: Json }> = [];
	private waiters: Array<{
		pred: (e: any) => boolean;
		resolve: (e: any) => void;
		timer: ReturnType<typeof setTimeout>;
	}> = [];
	private stderrTail: string[] = [];
	exited = false;
	constructor(binary: string) {
		this.child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
		this.child.stdout?.on("data", (c: Buffer) => this.onData(c));
		this.child.stderr?.on("data", (c: Buffer) => {
			for (const l of c.toString("utf8").split("\n")) {
				if (!l.trim()) continue;
				this.stderrTail.push(l);
				if (this.stderrTail.length > 40) this.stderrTail.shift();
			}
		});
		this.child.on("exit", () => {
			this.exited = true;
			this.failAll(new DapError("lldb-dap exited"));
		});
	}
	stderr() {
		return this.stderrTail.join("\n");
	}
	private failAll(e: Error) {
		for (const [, x] of this.pending) {
			clearTimeout(x.timer);
			x.reject(e);
		}
		this.pending.clear();
		for (const w of this.waiters) clearTimeout(w.timer);
		this.waiters = [];
	}
	private write(m: Json) {
		const b = JSON.stringify(m);
		this.child.stdin?.write(`Content-Length: ${Buffer.byteLength(b, "utf8")}\r\n\r\n${b}`);
	}
	private onData(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const he = this.buffer.indexOf("\r\n\r\n");
			if (he < 0) return;
			const header = this.buffer.subarray(0, he).toString("ascii");
			const m = /Content-Length:\s*(\d+)/i.exec(header);
			if (!m) throw new DapError("no CL");
			const len = Number(m[1]);
			const start = he + 4;
			if (this.buffer.length < start + len) return;
			const raw = this.buffer.subarray(start, start + len).toString("utf8");
			this.buffer = this.buffer.subarray(start + len);
			const msg = JSON.parse(raw) as Json;
			this.dispatch(msg);
		}
	}
	private dispatch(msg: Json) {
		if (msg.type === "response") {
			const rs = Number(msg.request_seq);
			const e = this.pending.get(rs);
			if (!e) return;
			this.pending.delete(rs);
			clearTimeout(e.timer);
			if (msg.success === true) e.resolve((msg.body as Json) ?? {});
			else e.reject(new DapError(`${e.command} failed: ${String(msg.message ?? "unknown")}`));
			return;
		}
		if (msg.type === "event") {
			const ev = { event: String(msg.event), body: (msg.body as Json) ?? {} };
			const idx = this.waiters.findIndex((w) => w.pred(ev));
			if (idx >= 0) {
				const w = this.waiters[idx];
				this.waiters.splice(idx, 1);
				clearTimeout(w.timer);
				w.resolve(ev);
			} else this.eventQueue.push(ev);
			return;
		}
		if (msg.type === "request") {
			const cmd = String(msg.command);
			this.write({
				seq: this.seq++,
				type: "response",
				request_seq: Number(msg.seq),
				success: true,
				command: cmd,
				body: {},
			});
		}
	}
	async send(command: string, args: Json = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Json> {
		const seq = this.seq++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(seq);
				reject(new DapError(`${command} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(seq, { command, resolve, reject, timer });
			this.write({ seq, type: "request", command, arguments: args });
		});
	}
	waitForEvent(pred: (e: any) => boolean, timeoutMs = EVENT_TIMEOUT_MS): Promise<any> {
		const idx = this.eventQueue.findIndex(pred);
		if (idx >= 0) {
			const [e] = this.eventQueue.splice(idx, 1);
			return Promise.resolve(e);
		}
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((w) => w.timer !== timer);
				reject(new DapError(`event wait timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.waiters.push({ pred, resolve, timer });
		});
	}
	kill() {
		if (this.exited) return;
		try {
			this.child.kill("SIGKILL");
		} catch {}
	}
}

function cargoBinary(): string {
	const p = spawnSync("cargo", ["--version"], { encoding: "utf8" });
	if (p.status === 0) return "cargo";
	return CARGO_GUESS;
}
function makeScratch(): { dir: string; binary: string; source: string; breakpointLine: number } {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "quarry-dap-eval-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "dap-spike"\nversion = "0.1.0"\nedition = "2021"\n\n[[bin]]\nname = "dap-spike"\npath = "src/main.rs"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, MAIN_RS);
	const lines = MAIN_RS.split("\n");
	const breakpointLine = lines.findIndex((l) => l.includes("black_box((&v")) + 1;
	const cargo = cargoBinary();
	const build = spawnSync(cargo, ["build", "--quiet"], {
		cwd: dir,
		encoding: "utf8",
		env: { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}` },
	});
	if (build.status !== 0) throw new Error(`cargo build failed:\n${build.stderr || build.stdout}`);
	const binary = join(dir, "target", "debug", "dap-spike");
	readFileSync(binary);
	return { dir, binary, source, breakpointLine };
}
function sysroot(): string {
	let s = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" }).stdout?.trim() ?? "";
	if (!s)
		s =
			spawnSync("/opt/homebrew/opt/rustup/bin/rustc", ["--print", "sysroot"], {
				encoding: "utf8",
			}).stdout?.trim() ?? "";
	return s;
}
async function setupSession(
	adapterPath: string,
	scratch: any,
	initCommands: string[],
): Promise<{
	client: DapClient;
	frameId: number;
	localsRef: number;
	threadId: number;
	pointerAddr: string;
	rawValue: string;
}> {
	const client = new DapClient(adapterPath);
	await client.send("initialize", {
		clientID: "quarry-dap-eval",
		clientName: "quarry dap eval",
		adapterID: "lldb",
		linesStartAt1: true,
		pathFormat: "path",
		supportsVariableType: true,
		supportsMemoryReferences: true,
	});
	await client.send("launch", {
		program: scratch.binary,
		args: [],
		cwd: scratch.dir,
		stopOnEntry: true,
		terminal: "console",
		initCommands,
	});
	await client.send("setBreakpoints", {
		source: { name: "main.rs", path: scratch.source },
		breakpoints: [{ line: scratch.breakpointLine }],
		sourceModified: false,
	});
	await client.send("configurationDone", {});
	let stopped = await client.waitForEvent((e: any) => e.event === "stopped");
	let threadId = Number(stopped.body?.threadId ?? 0);
	let frames: any[] = [];
	for (let i = 0; i < 8; i++) {
		const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 5 });
		frames = (stack.stackFrames as any[]) ?? [];
		const top = frames[0];
		const topSource = String((top?.source as any)?.path ?? "");
		if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs")) break;
		await client.send("continue", { threadId });
		stopped = await client.waitForEvent((e: any) => e.event === "stopped");
		threadId = Number(stopped.body?.threadId ?? threadId);
	}
	const frameId = Number(frames[0]?.id ?? 0);
	const scopesResult = await client.send("scopes", { frameId });
	const scopes = (scopesResult.scopes as any[]) ?? [];
	const localsScope =
		scopes.find((s: any) => s.presentationHint === "locals") ??
		scopes.find((s: any) => /local/i.test(String(s.name))) ??
		scopes[0];
	const localsRef = Number(localsScope.variablesReference);
	return { client, frameId, localsRef, threadId, pointerAddr: "", rawValue: "" };
}
function shortErr(e: unknown): string {
	return (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 240);
}

async function main() {
	const adapterPath = spawnSync("xcrun", ["--find", "lldb-dap"], {
		encoding: "utf8",
	}).stdout?.trim();
	if (!adapterPath) throw new Error("no adapter");
	const scratch = makeScratch();
	const sr = sysroot();
	const lookup = join(sr, "lib", "rustlib", "etc", "lldb_lookup.py");
	const baseInit = [`command script import ${lookup}`];
	const results: Array<{ variant: string; result: string }> = [];
	const record = (variant: string, result: string) => {
		results.push({ variant, result });
		console.log(`${variant}: ${result}`);
	};

	// capture pointer addr
	const s1 = await setupSession(adapterPath, scratch, baseInit);
	const vars0 = await s1.client.send("variables", { variablesReference: s1.localsRef });
	const locals0 = (vars0.variables as any[]) ?? [];
	const rawVar = locals0.find((v: any) => v.name === "raw");
	const rawValue = String(rawVar?.value ?? "");
	const m = /^0x[0-9a-f]+/i.exec(rawValue.trim());
	const pointerAddr = m?.[0] ?? "";
	s1.pointerAddr = pointerAddr;
	s1.rawValue = rawValue;

	// escape hatches FIRST (process still stopped)
	try {
		const def = await s1.client.send("variables", { variablesReference: s1.localsRef });
		const named = await s1.client.send("variables", {
			variablesReference: s1.localsRef,
			filter: "named",
		});
		record(
			"(i) variables default",
			`OK count=${(def.variables as any[]).length} names=${(def.variables as any[]).map((v: any) => v.name).join(",")}`,
		);
		record(
			"(i) variables filter=named",
			`OK count=${(named.variables as any[]).length} names=${(named.variables as any[]).map((v: any) => v.name).join(",")}`,
		);
	} catch (e) {
		record("(i) variables filter", `FAIL ${shortErr(e)}`);
	}

	record("(ii) setExpression", "SKIPPED - crashes lldb-dap here (measured: adapter exited)");

	try {
		if (!pointerAddr) throw new Error("no raw pointer address");
		const mem = await s1.client.send("readMemory", {
			memoryReference: pointerAddr,
			count: KNOWN_BYTES.length,
			offset: 0,
		});
		const bytes = Array.from(Buffer.from(String(mem.data ?? ""), "base64"));
		const ok =
			bytes.length === KNOWN_BYTES.length && bytes.every((b, i) => b === KNOWN_BYTES[i]);
		record(
			"(iii) readMemory via raw ptr",
			`${ok ? "OK" : "MISMATCH"} ${bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
		);
	} catch (e) {
		record("(iii) readMemory via raw ptr", `FAIL ${shortErr(e)}`);
	}

	// evaluate variants
	try {
		const r = await s1.client.send("evaluate", { expression: "n", context: "repl" });
		record("(a) repl, n", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(a) repl, n", `FAIL ${shortErr(e)}`);
	}
	try {
		const r = await s1.client.send("evaluate", { expression: "*raw@8", context: "watch" });
		record("(b) watch, *raw@8", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(b) watch, *raw@8", `FAIL ${shortErr(e)}`);
	}
	try {
		const r = await s1.client.send("evaluate", { expression: "n", context: "hover" });
		record("(c) hover, n", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(c) hover, n", `FAIL ${shortErr(e)}`);
	}
	try {
		const r = await s1.client.send("evaluate", {
			expression: "n",
			context: "repl",
			frameId: s1.frameId,
		});
		record("(e) repl, n, frameId", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(e) repl, n, frameId", `FAIL ${shortErr(e)}`);
	}
	try {
		const r = await s1.client.send("evaluate", { expression: "n", context: "repl" });
		record("(f) expressions/repl", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(f) expressions/repl", `FAIL ${shortErr(e)}`);
	}
	try {
		const r = await s1.client.send("evaluate", { expression: "n", context: "watch" });
		record("(f) expressions/watch", `OK ${String(r.result ?? "")}`);
	} catch (e) {
		record("(f) expressions/watch", `FAIL ${shortErr(e)}`);
	}

	try {
		await s1.client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
	} catch {}
	s1.client.kill();

	// session 2: settings set target.language rust
	const s2Init = [...baseInit, "settings set target.language rust"];
	const s2 = await setupSession(adapterPath, scratch, s2Init);
	for (const [label, expr, ctx] of [
		["(d) repl, n", "n", "repl"],
		["(d) watch, *raw@8", "*raw@8", "watch"],
		["(d) hover, n", "n", "hover"],
	] as const) {
		try {
			const r = await s2.client.send("evaluate", { expression: expr, context: ctx });
			record(label, `OK ${String(r.result ?? "")}`);
		} catch (e) {
			record(label, `FAIL ${shortErr(e)}`);
		}
	}
	try {
		await s2.client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
	} catch {}
	s2.client.kill();

	console.log("\n--- SUMMARY ---");
	for (const r of results) console.log(`${r.variant} => ${r.result}`);
}

main().catch((e) => {
	console.error(`dap-eval-probe: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
