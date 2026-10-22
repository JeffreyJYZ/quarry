#!/usr/bin/env bun
/**
 * DAP spike for quarry (docs/plans/001-clion-parity.md §6).
 *
 * Generates a throwaway cargo project in a temp dir, builds it, then speaks
 * raw DAP to lldb-dap over Content-Length framed JSON on stdio and measures:
 * readMemory, disassemble, data breakpoints, and whether Rust Vec/String
 * pretty-print. Exits non-zero when a required step fails.
 *
 * Usage: bun run scripts/dap-spike.ts [--project <dir>] [--json]
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUEST_TIMEOUT_MS = 20_000;
const EVENT_TIMEOUT_MS = 20_000;

const KNOWN_BYTES = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
const KNOWN_STRING = "quarry";
const KNOWN_OPTION_VALUE = 1234;

// ---------------------------------------------------------------- scratch project

const CARGO_GUESS = "/opt/homebrew/opt/rustup/bin/cargo";

const MAIN_RS = `use std::hint::black_box;

static mut COUNTER: u32 = 0;

fn inspect(tag: u8) -> u64 {
    let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
    let s: String = String::from("${KNOWN_STRING}");
    let o: Option<u32> = Some(${KNOWN_OPTION_VALUE});
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

interface Scratch {
	dir: string;
	binary: string;
	source: string;
	breakpointLine: number;
}

function cargoBinary(): string {
	const probe = spawnSync("cargo", ["--version"], { encoding: "utf8" });
	if (probe.status === 0) return "cargo";
	return CARGO_GUESS;
}

function makeScratch(forcedDir?: string): Scratch {
	// mktemp gives /var/folders/... which is a symlink to /private/var/folders/...
	// lldb canonicalises the DWARF source path, so build under the real path or
	// every breakpoint stays unverified.
	const dir = realpathSync(forcedDir ?? mkdtempSync(join(tmpdir(), "quarry-dap-spike-")));
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(
		join(dir, "Cargo.toml"),
		`[package]\nname = "dap-spike"\nversion = "0.1.0"\nedition = "2021"\n\n[[bin]]\nname = "dap-spike"\npath = "src/main.rs"\n`,
	);
	const source = join(dir, "src", "main.rs");
	writeFileSync(source, MAIN_RS);

	const lines = MAIN_RS.split("\n");
	const breakpointLine = lines.findIndex((l) => l.includes("black_box((&v")) + 1;
	if (breakpointLine < 1) throw new Error("breakpoint marker missing from generated main.rs");

	const cargo = cargoBinary();
	const build = spawnSync(cargo, ["build", "--quiet"], {
		cwd: dir,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ""}`,
		},
	});
	if (build.status !== 0) {
		throw new Error(`cargo build failed (${cargo}):\n${build.stderr || build.stdout}`);
	}
	const binary = join(dir, "target", "debug", "dap-spike");
	readFileSync(binary); // throws if the artifact is missing
	return { dir, binary, source, breakpointLine };
}

// ---------------------------------------------------------------- DAP transport

type Json = Record<string, unknown>;

interface DapEvent {
	event: string;
	body?: Json;
}

class DapError extends Error {}

class DapClient {
	private child: ChildProcess;
	private buffer = Buffer.alloc(0);
	private seq = 1;
	private pending = new Map<
		number,
		{
			command: string;
			resolve: (body: Json) => void;
			reject: (e: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private eventQueue: DapEvent[] = [];
	private waiters: Array<{
		pred: (e: DapEvent) => boolean;
		resolve: (e: DapEvent) => void;
		timer: ReturnType<typeof setTimeout>;
	}> = [];
	private stderrTail: string[] = [];
	readonly reverseRequests: string[] = [];
	readonly eventLog: string[] = [];
	exited = false;

	constructor(binary: string) {
		this.child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
		this.child.stdout?.on("data", (chunk: Buffer) => this.onData(chunk));
		this.child.stderr?.on("data", (chunk: Buffer) => {
			for (const line of chunk.toString("utf8").split("\n")) {
				if (!line.trim()) continue;
				this.stderrTail.push(line);
				if (this.stderrTail.length > 40) this.stderrTail.shift();
			}
		});
		this.child.on("exit", () => {
			this.exited = true;
			this.failAll(new DapError("lldb-dap exited"));
		});
	}

	stderr(): string {
		return this.stderrTail.join("\n");
	}

	private failAll(error: Error) {
		for (const [, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(error);
		}
		this.pending.clear();
		for (const waiter of this.waiters) {
			clearTimeout(waiter.timer);
		}
		this.waiters = [];
	}

	private write(message: Json) {
		const body = JSON.stringify(message);
		this.child.stdin?.write(
			`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
		);
	}

	private onData(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const headerEnd = this.buffer.indexOf("\r\n\r\n");
			if (headerEnd < 0) return;
			const header = this.buffer.subarray(0, headerEnd).toString("ascii");
			const match = /Content-Length:\s*(\d+)/i.exec(header);
			if (!match) {
				throw new DapError(`no Content-Length in header: ${JSON.stringify(header)}`);
			}
			const length = Number(match[1]);
			const start = headerEnd + 4;
			if (this.buffer.length < start + length) return;
			const raw = this.buffer.subarray(start, start + length).toString("utf8");
			this.buffer = this.buffer.subarray(start + length);
			let message: Json;
			try {
				message = JSON.parse(raw) as Json;
			} catch {
				throw new DapError(`unparseable DAP payload: ${raw.slice(0, 200)}`);
			}
			this.dispatch(message);
		}
	}

	private dispatch(message: Json) {
		const type = message.type;
		if (type === "response") {
			const requestSeq = Number(message.request_seq);
			const entry = this.pending.get(requestSeq);
			if (!entry) return;
			this.pending.delete(requestSeq);
			clearTimeout(entry.timer);
			if (message.success === true) {
				entry.resolve((message.body as Json) ?? {});
			} else {
				entry.reject(
					new DapError(
						`${entry.command} failed: ${String(message.message ?? "unknown")}`,
					),
				);
			}
			return;
		}
		if (type === "event") {
			this.eventLog.push(String(message.event));
			const event: DapEvent = {
				event: String(message.event),
				body: (message.body as Json) ?? {},
			};
			const index = this.waiters.findIndex((w) => w.pred(event));
			if (index >= 0) {
				const waiter = this.waiters[index];
				this.waiters.splice(index, 1);
				clearTimeout(waiter.timer);
				waiter.resolve(event);
			} else {
				this.eventQueue.push(event);
			}
			return;
		}
		if (type === "request") {
			// Adapter-initiated request (runInTerminal, startDebugging, ...). The spike
			// runs the program on the adapter's own console, so acknowledge instead of
			// deadlocking. Recorded so the report can name what was asked for.
			const command = String(message.command);
			this.reverseRequests.push(command);
			this.write({
				seq: this.seq++,
				type: "response",
				request_seq: Number(message.seq),
				success: true,
				command,
				body: {},
			});
		}
	}

	async send(command: string, args: Json = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Json> {
		const seq = this.seq++;
		return new Promise<Json>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(seq);
				reject(new DapError(`${command} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(seq, { command, resolve, reject, timer });
			this.write({ seq, type: "request", command, arguments: args });
		});
	}

	waitForEvent(pred: (e: DapEvent) => boolean, timeoutMs = EVENT_TIMEOUT_MS): Promise<DapEvent> {
		const index = this.eventQueue.findIndex(pred);
		if (index >= 0) {
			const [event] = this.eventQueue.splice(index, 1);
			return Promise.resolve(event);
		}
		return new Promise<DapEvent>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((w) => w.timer !== timer);
				reject(new DapError(`event wait timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.waiters.push({ pred, resolve, timer });
		});
	}

	drainEvents(): DapEvent[] {
		const events = this.eventQueue;
		this.eventQueue = [];
		return events;
	}

	kill() {
		if (this.exited) return;
		try {
			this.child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}
}

// ---------------------------------------------------------------- helpers

function hexdump(bytes: number[]): string {
	return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function findVariable(
	vars: Array<{ name: string; value: string; type?: string; variablesReference?: number }>,
	name: string,
) {
	return vars.find((v) => v.name === name);
}

interface Measure {
	name: string;
	required: boolean;
	ok: boolean;
	detail: string;
}

// ---------------------------------------------------------------- rust formatter probe

/**
 * Second, independent session with rustup's lldb python providers loaded via
 * `initCommands` — what `rust-lldb` does. Answers whether a Rust visualizer
 * shim is needed at all, or only a launch flag.
 */
async function probeRustFormatters(adapterPath: string, scratch: Scratch): Promise<Json> {
	const sysrootProbe = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" });
	let sysroot = sysrootProbe.stdout?.trim() ?? "";
	if (!sysroot) {
		const guess = "/opt/homebrew/opt/rustup/bin/rustc";
		sysroot =
			spawnSync(guess, ["--print", "sysroot"], { encoding: "utf8" }).stdout?.trim() ?? "";
	}
	if (!sysroot) return { error: "no rustc sysroot" };

	const etc = join(sysroot, "lib", "rustlib", "etc");
	const lookup = join(etc, "lldb_lookup.py");
	const commands = join(etc, "lldb_commands");
	if (!existsSync(lookup)) return { error: `missing ${lookup}`, sysroot };

	const initCommands = [`command script import ${lookup}`];
	if (existsSync(commands)) initCommands.push(`command source ${commands}`);

	const client = new DapClient(adapterPath);
	const out: Json = { sysroot, initCommands };
	try {
		await client.send("initialize", {
			clientID: "quarry-dap-spike",
			clientName: "quarry dap spike",
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

		let stopped = await client.waitForEvent((e) => e.event === "stopped");
		let threadId = Number(stopped.body?.threadId ?? 0);
		let frames: Array<Json> = [];
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 5 });
			frames = (stack.stackFrames as Array<Json> | undefined) ?? [];
			const top = frames[0];
			const topSource = String((top?.source as Json | undefined)?.path ?? "");
			if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs"))
				break;
			await client.send("continue", { threadId });
			stopped = await client.waitForEvent((e) => e.event === "stopped");
			threadId = Number(stopped.body?.threadId ?? threadId);
		}

		const scopesResult = await client.send("scopes", { frameId: Number(frames[0]?.id ?? 0) });
		const scopes = (scopesResult.scopes as Array<Json> | undefined) ?? [];
		const localsScope =
			scopes.find((s) => s.presentationHint === "locals") ??
			scopes.find((s) => /local/i.test(String(s.name)));
		if (!localsScope) throw new DapError("no locals scope with formatters loaded");
		const variablesResult = await client.send("variables", {
			variablesReference: Number(localsScope.variablesReference),
		});
		const locals = ((variablesResult.variables as Array<Json> | undefined) ?? []).map((v) => ({
			name: String(v.name),
			value: String(v.value),
			type: String(v.type ?? ""),
			variablesReference: Number(v.variablesReference ?? 0),
		}));
		const pick = (name: string) => locals.find((l) => l.name === name);
		out.vec = pick("v")?.value ?? null;
		out.string = pick("s")?.value ?? null;
		out.option = pick("o")?.value ?? null;
		out.pointer = pick("raw")?.value ?? null;
		const children = async (ref: number | undefined) => {
			if (!ref || ref <= 0) return [] as Array<{ name: string; value: string }>;
			const result = await client.send("variables", { variablesReference: ref });
			return ((result.variables as Array<Json> | undefined) ?? []).map((c) => ({
				name: String(c.name),
				value: String(c.value),
			}));
		};
		out.vecChildren = await children(pick("v")?.variablesReference);
		out.stringChildren = await children(pick("s")?.variablesReference);

		try {
			await client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
		} catch {
			// killed below
		}
	} catch (error) {
		out.error = error instanceof Error ? error.message : String(error);
		out.stderr = client.stderr().split("\n").slice(-4);
	} finally {
		client.kill();
	}
	return out;
}

// ---------------------------------------------------------------- main

async function main() {
	const argv = process.argv.slice(2);
	const projectIndex = argv.indexOf("--project");
	const forcedDir = projectIndex >= 0 ? argv[projectIndex + 1] : undefined;
	const emitJson = argv.includes("--json");

	const measures: Measure[] = [];
	const measure = (name: string, ok: boolean, detail: string, required = true) => {
		measures.push({ name, required, ok, detail });
		return ok;
	};

	const versionProbe = spawnSync("xcrun", ["lldb-dap", "--version"], { encoding: "utf8" });
	const adapterPath = spawnSync("xcrun", ["--find", "lldb-dap"], {
		encoding: "utf8",
	}).stdout?.trim();
	if (!adapterPath) throw new Error("xcrun --find lldb-dap returned nothing");
	const llvmVersion = /LLVM version ([\d.]+)/.exec(versionProbe.stdout ?? "")?.[1] ?? "unknown";
	const liblldb = /liblldb: (lldb-[\d.a-z]+)/.exec(versionProbe.stdout ?? "")?.[1] ?? "unknown";

	const scratch = makeScratch(forcedDir);
	const report: Record<string, unknown> = {
		adapterPath,
		llvmVersion,
		liblldb,
		breakpointLine: scratch.breakpointLine,
	};

	const client = new DapClient(adapterPath);
	const fail = (name: string, detail: string) => {
		measure(name, false, detail, true);
	};

	try {
		// 1. initialize
		const caps = await client.send("initialize", {
			clientID: "quarry-dap-spike",
			clientName: "quarry dap spike",
			adapterID: "lldb",
			locale: "en-US",
			linesStartAt1: true,
			columnsStartAt1: true,
			pathFormat: "path",
			supportsVariableType: true,
			supportsVariablePaging: true,
			supportsMemoryReferences: true,
			supportsRunInTerminalRequest: false,
		});
		const capNames = [
			"supportsReadMemoryRequest",
			"supportsDisassembleRequest",
			"supportsDataBreakpoints",
			"supportsMemoryReferences",
			"supportsMemoryEvent",
			"supportsWriteMemoryRequest",
			"supportsSetVariable",
			"supportsConditionalBreakpoints",
			"supportsHitConditionalBreakpoints",
			"supportsLogPoints",
			"supportsEvaluateForHovers",
			"supportsRestartRequest",
			"supportsTerminateRequest",
		];
		const capabilities: Record<string, boolean> = {};
		for (const name of capNames) capabilities[name] = caps[name] === true;
		report.capabilities = capabilities;

		// 2. launch. lldb-dap answers launch after target creation (before
		// configurationDone), so the target exists by the time breakpoints land.
		await client.send("launch", {
			program: scratch.binary,
			args: [],
			cwd: scratch.dir,
			stopOnEntry: true,
			terminal: "console",
		});

		// 3. setBreakpoints
		const bpResult = await client.send("setBreakpoints", {
			source: { name: "main.rs", path: scratch.source },
			breakpoints: [{ line: scratch.breakpointLine }],
			sourceModified: false,
		});
		const breakpoints = (bpResult.breakpoints as Array<Json> | undefined) ?? [];
		let verified = breakpoints.filter((b) => b.verified === true).length;
		if (verified < 1) {
			// A pending breakpoint is re-reported as a `breakpoint` event once resolved.
			const resolved = await client
				.waitForEvent((e) => e.event === "breakpoint", 5_000)
				.catch(() => null);
			if (resolved?.body?.breakpoint) {
				const bp = resolved.body.breakpoint as Json;
				if (bp.verified === true) verified = 1;
				report.breakpointEvent = {
					reason: resolved.body.reason ?? null,
					verified: bp.verified,
				};
			}
		}
		if (verified < 1) fail("setBreakpoints", `line ${scratch.breakpointLine} not verified`);
		report.breakpoint = { line: scratch.breakpointLine, verified };

		// 4. configurationDone
		await client.send("configurationDone", {});

		// 5. wait for the breakpoint stop. stopOnEntry lands in dyld (reason
		// "exception" on arm64), so keep resuming until the top frame is our line.
		let stopped = await client.waitForEvent((e) => e.event === "stopped");
		report.entryStopReason = String(stopped.body?.reason ?? "unknown");
		let threadId = Number(stopped.body?.threadId ?? 0);
		let frames: Array<Json> = [];
		const stopSummaries: string[] = [];
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 20 });
			frames = (stack.stackFrames as Array<Json> | undefined) ?? [];
			const top = frames[0];
			const topSource = String((top?.source as Json | undefined)?.path ?? "");
			stopSummaries.push(
				`${String(stopped.body?.reason ?? "?")}:${String(top?.name ?? "?")}@${String(top?.line ?? "?")}`,
			);
			if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs"))
				break;
			await client.send("continue", { threadId });
			stopped = await client.waitForEvent((e) => e.event === "stopped");
			threadId = Number(stopped.body?.threadId ?? threadId);
		}
		report.stopTrail = stopSummaries;
		report.stopReason = String(stopped.body?.reason ?? "unknown");
		report.allThreadsStopped = stopped.body?.allThreadsStopped === true;

		// 6. threads, then the scopes/variables of the top frame
		const threads = await client.send("threads", {});
		const threadList = (threads.threads as Array<Json> | undefined) ?? [];
		report.threads = threadList.map((t) => ({ id: t.id, name: t.name }));

		// biome-ignore lint/suspicious/noConfusingLabels: a labeled block gives an early exit across a long await section
		matchTopFrame: {
			const top = frames[0];
			if (!top) {
				fail("stackTrace", "no frames");
				break matchTopFrame;
			}
			report.topFrame = {
				name: top.name,
				line: top.line,
				source: (top.source as Json | undefined)?.path ?? null,
				instructionPointerReference: top.instructionPointerReference ?? null,
			};
			const atBreakpoint = Number(top.line) === scratch.breakpointLine;
			if (!atBreakpoint) {
				measure(
					"stopAtBreakpoint",
					false,
					`stopped at line ${String(top.line)} of ${String((top.source as Json | undefined)?.path)}, expected ${scratch.breakpointLine}`,
				);
			}
		}

		const frameId = Number(frames[0]?.id ?? 0);
		const scopesResult = await client.send("scopes", { frameId });
		const scopes = (scopesResult.scopes as Array<Json> | undefined) ?? [];
		report.scopes = scopes.map((s) => ({ name: s.name, hint: s.presentationHint ?? null }));
		const localsScope =
			scopes.find((s) => s.presentationHint === "locals") ??
			scopes.find((s) => /local/i.test(String(s.name))) ??
			scopes[0];
		if (!localsScope) throw new DapError("no scopes returned");
		const localsRef = Number(localsScope.variablesReference);
		const variablesResult = await client.send("variables", { variablesReference: localsRef });
		const variables = (variablesResult.variables as Array<Json> | undefined) ?? [];
		const locals = variables.map((v) => ({
			name: String(v.name),
			value: String(v.value),
			type: String(v.type ?? ""),
			variablesReference: Number(v.variablesReference ?? 0),
		}));
		report.locals = locals;

		const vec = findVariable(locals, "v");
		const string = findVariable(locals, "s");
		const option = findVariable(locals, "o");
		const pointer = findVariable(locals, "raw");
		const counter = findVariable(locals, "n");
		report.renderings = {
			vec: vec?.value ?? null,
			vecType: vec?.type ?? null,
			string: string?.value ?? null,
			stringType: string?.type ?? null,
			option: option?.value ?? null,
			optionType: option?.type ?? null,
			pointer: pointer?.value ?? null,
			counter: counter?.value ?? null,
		};

		// children of the Vec and the String: are these elements, or raw struct fields?
		const childNames = async (ref: number | undefined) => {
			if (!ref || ref <= 0)
				return [] as Array<{ name: string; value: string; variablesReference: number }>;
			const children = await client.send("variables", { variablesReference: ref });
			return ((children.variables as Array<Json> | undefined) ?? []).map((c) => ({
				name: String(c.name),
				value: String(c.value),
				variablesReference: Number(c.variablesReference ?? 0),
			}));
		};
		const vecChildren = await childNames(vec?.variablesReference);
		const stringChildren = await childNames(string?.variablesReference);
		const optionChildren = await childNames(option?.variablesReference);
		report.vecChildren = vecChildren.map((c) => ({ name: c.name, value: c.value }));
		report.stringChildren = stringChildren.map((c) => ({ name: c.name, value: c.value }));
		report.optionChildren = optionChildren.map((c) => ({ name: c.name, value: c.value }));
		if (vecChildren[0]?.variablesReference) {
			report.rawVecChildren = (await childNames(vecChildren[0].variablesReference)).map(
				(c) => ({
					name: c.name,
					value: c.value,
				}),
			);
		}

		// A synthetic Rust view lists elements (`[0]`, `0`); the raw view lists the
		// struct's own fields (`buf`, `len`).
		const elementLike = (children: Array<{ name: string }>) =>
			children.filter((c) => /^\[?\d+\]?$/.test(c.name)).length;
		const vecElements = elementLike(vecChildren);
		const vecPretty = vecElements >= KNOWN_BYTES.length;
		const stringPretty =
			/quarry/.test(string?.value ?? "") ||
			stringChildren.some((c) => /quarry/.test(c.value));
		measure(
			"prettyPrint",
			vecPretty && stringPretty,
			`vecElements=${vecElements} vecChildren=${vecChildren.map((c) => c.name).join(",")} stringChildren=${stringChildren.map((c) => c.name).join(",")}`,
			false,
		);
		report.pretty = {
			vec: vecPretty,
			string: stringPretty,
			optionShowsSome:
				/\bSome\b/.test(option?.value ?? "") ||
				optionChildren.some((c) => /\bSome\b/.test(c.name)),
		};

		// Fallback check: LLDB's array-slice operator can still enumerate the buffer
		// from the raw pointer even without a formatter.
		if (pointer) {
			try {
				const evaluated = await client.send("evaluate", {
					expression: "*raw@8",
					frameId: Number(frames[0]?.id ?? 0),
					context: "watch",
				});
				report.arraySlice = String(evaluated.result ?? "");
			} catch (error) {
				report.arraySlice = `error: ${error instanceof Error ? error.message : String(error)}`;
			}
		}

		// 7. readMemory at the buffer address (the pointer's value carries a string
		// summary suffix, so take the leading address token).
		const addressMatch = /^0x[0-9a-f]+/i.exec(pointer?.value.trim() ?? "");
		let address = addressMatch?.[0] ?? "";
		if (!address) {
			const childAddress = vecChildren[0]?.name;
			if (childAddress && /^0x[0-9a-f]+$/i.test(childAddress)) address = childAddress;
		}
		if (!address) {
			fail("readMemory", `no usable address (raw=${address || "absent"})`);
		} else {
			report.readMemoryAddress = address;
			const memory = await client.send("readMemory", {
				memoryReference: address,
				count: KNOWN_BYTES.length,
				offset: 0,
			});
			const base64 = String(memory.data ?? "");
			const bytes = Array.from(Buffer.from(base64, "base64"));
			report.readMemoryBytes = bytes;
			report.readMemoryHex = hexdump(bytes);
			const matches =
				bytes.length === KNOWN_BYTES.length && bytes.every((b, i) => b === KNOWN_BYTES[i]);
			if (!matches) {
				fail("readMemory", `expected ${hexdump(KNOWN_BYTES)}, got ${hexdump(bytes)}`);
			}
		}

		// 8. disassemble at the frame's instruction pointer
		const pc = String(frames[0]?.instructionPointerReference ?? "");
		report.instructionPointer = pc || null;
		if (!/^0x[0-9a-f]+$/i.test(pc)) {
			measure("disassemble", false, "frame had no instructionPointerReference", false);
		} else {
			const dis = await client.send("disassemble", {
				memoryReference: pc,
				offset: 0,
				instructionOffset: 0,
				instructionCount: 4,
				resolveSymbols: true,
			});
			const instructions = ((dis.instructions as Array<Json> | undefined) ?? []).map((i) => ({
				address: String(i.address),
				instruction: String(i.instruction),
				symbol: i.symbol ? String(i.symbol) : null,
			}));
			report.disassembly = instructions;
			if (instructions.length < 2) {
				fail("disassemble", `expected >=2 instructions, got ${instructions.length}`);
			}
		}

		// 9. dataBreakpointInfo + setDataBreakpoints
		const watchName = counter ? "n" : String(locals[0]?.name ?? "");
		const info = await client.send("dataBreakpointInfo", {
			variablesReference: localsRef,
			name: watchName,
		});
		const dataId = typeof info.dataId === "string" ? info.dataId : null;
		report.dataBreakpoint = {
			name: watchName,
			dataId,
			description: info.description ?? null,
			accessTypes: info.accessTypes ?? null,
			canPersist: info.canPersist ?? null,
		};
		if (capabilities.supportsDataBreakpoints && !dataId) {
			fail("dataBreakpointInfo", `no dataId for ${watchName}`);
		}

		// A stack slot is reused by later frames, so also watch the static, whose
		// address stays valid and whose write is attributable.
		const globalsScope = scopes.find((s) => /global/i.test(String(s.name)));
		let counterInfo: Json | null = null;
		let counterName = "";
		if (globalsScope) {
			const globalsResult = await client.send("variables", {
				variablesReference: Number(globalsScope.variablesReference),
			});
			const globals = (globalsResult.variables as Array<Json> | undefined) ?? [];
			const counterVar = globals.find((g) => /COUNTER/.test(String(g.name)));
			if (counterVar) {
				counterName = String(counterVar.name);
				counterInfo = await client.send("dataBreakpointInfo", {
					variablesReference: Number(globalsScope.variablesReference),
					name: counterName,
				});
				report.staticDataBreakpoint = {
					name: counterName,
					dataId: counterInfo.dataId ?? null,
					description: counterInfo.description ?? null,
					accessTypes: counterInfo.accessTypes ?? null,
				};
			}
		}

		const watchDataId =
			typeof counterInfo?.dataId === "string" ? String(counterInfo.dataId) : dataId;
		if (watchDataId) {
			const setResult = await client.send("setDataBreakpoints", {
				breakpoints: [{ dataId: watchDataId, accessType: "write" }],
			});
			report.setDataBreakpoints = setResult.breakpoints ?? null;

			// Remove the line breakpoint so the only armed stop is the watchpoint,
			// which makes the resulting frame attributable to the watched write.
			await client.send("setBreakpoints", {
				source: { name: "main.rs", path: scratch.source },
				breakpoints: [],
			});
			await client.send("continue", { threadId });
			const outcome = await client
				.waitForEvent((e) => e.event === "stopped" || e.event === "terminated", 10_000)
				.catch(() => null);
			report.dataBreakpointOutcome = outcome
				? {
						event: outcome.event,
						reason: outcome.body?.reason ?? null,
						hitBreakpointIds: outcome.body?.hitBreakpointIds ?? null,
						description: outcome.body?.description ?? null,
					}
				: { event: "none", reason: null };
			if (outcome?.event === "stopped") {
				threadId = Number(outcome.body?.threadId ?? threadId);
				const hitStack = await client.send("stackTrace", {
					threadId,
					startFrame: 0,
					levels: 5,
				});
				const hitTop = ((hitStack.stackFrames as Array<Json> | undefined) ?? [])[0];
				report.dataBreakpointStop = {
					name: hitTop?.name ?? null,
					line: hitTop?.line ?? null,
					source: (hitTop?.source as Json | undefined)?.path ?? null,
				};
				// Decisive check: re-read the watched static. It advances 8 -> 16 when the
				// second call writes it, so a value of 16 proves the watchpoint targeted it.
				const staticId =
					typeof counterInfo?.dataId === "string" ? String(counterInfo.dataId) : "";
				const staticAddress = /^([0-9a-f]+)\/(\d+)$/i.exec(staticId);
				if (staticAddress) {
					const word = await client.send("readMemory", {
						memoryReference: `0x${staticAddress[1]}`,
						count: Number(staticAddress[2]),
					});
					const bytes = Array.from(Buffer.from(String(word.data ?? ""), "base64"));
					report.counterAtWatchStop = bytes.reduce(
						(acc, byte, index) => acc + byte * 256 ** index,
						0,
					);
				}
			}
		}

		// 10. run to completion
		let continueError: string | null = null;
		try {
			await client.send("continue", { threadId }, 5_000);
		} catch (error) {
			continueError = error instanceof Error ? error.message : String(error);
		}
		const done = await client
			.waitForEvent((e) => e.event === "terminated" || e.event === "exited", 15_000)
			.catch(() => null);
		report.finish = done
			? { event: done.event, exitCode: done.body?.exitCode ?? null, continueError }
			: { event: "timeout", exitCode: null, continueError };

		// 11. disconnect
		try {
			await client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
		} catch {
			// adapter may already be gone; the child is killed below either way
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		fail("dap", message);
	} finally {
		client.kill();
	}

	report.rustFormatters = await probeRustFormatters(adapterPath, scratch).catch((error) => ({
		error: error instanceof Error ? error.message : String(error),
	}));

	report.eventLog = client.eventLog;
	report.reverseRequests = client.reverseRequests;
	report.stderrTail = client.stderr().split("\n").slice(-6);

	const required = measures.filter((m) => m.required);
	const failed = required.filter((m) => !m.ok);

	if (emitJson) {
		console.log(JSON.stringify({ ...report, measures }, null, 2));
	} else {
		const caps = report.capabilities as Record<string, boolean>;
		const yn = (v: boolean | undefined) => (v ? "yes" : "no");
		const renderings = report.renderings as Record<string, string | null> | undefined;
		const disasm = report.disassembly as
			| Array<{ address: string; instruction: string }>
			| undefined;
		const dataBp = report.dataBreakpoint as { name: string; dataId: string | null } | undefined;
		const topFrame = report.topFrame as { name: string; line: number } | undefined;
		const lines: string[] = [];
		lines.push("DAP spike — lldb-dap");
		lines.push(`  adapter     ${adapterPath}`);
		lines.push(`  version     LLVM ${llvmVersion} · ${liblldb}`);
		lines.push(
			`  caps        readMemory=${yn(caps.supportsReadMemoryRequest)} disassemble=${yn(caps.supportsDisassembleRequest)} dataBreakpoints=${yn(caps.supportsDataBreakpoints)} memoryRefs=${yn(caps.supportsMemoryReferences)} memoryEvent=${yn(caps.supportsMemoryEvent)}`,
		);
		lines.push(
			`  breakpoint  main.rs:${String(report.breakpointLine)} verified=${String((report.breakpoint as { verified: number }).verified)} stoppedIn=${topFrame?.name ?? "?"}@${String(topFrame?.line)}`,
		);
		lines.push(`  vec         ${renderings?.vec ?? "(absent)"}`);
		lines.push(
			`              children: ${((report.vecChildren as Array<{ name: string; value: string }> | undefined) ?? []).map((c) => `${c.name}=${c.value}`).join(" · ") || "(none)"}`,
		);
		lines.push(
			`  string      ${renderings?.string ?? "(absent)"} · children: ${((report.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",") || "(none)"}`,
		);
		lines.push(
			`  option      ${renderings?.option ?? "(absent)"} · children: ${((report.optionChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",") || "(none)"}`,
		);
		lines.push(
			`  pointer     ${(renderings?.pointer ?? "(absent)").replace(/\s+"[\s\S]*$/, ' "…"')}`,
		);
		lines.push(
			`  readMemory  ${String(report.readMemoryAddress ?? "?")} = ${String(report.readMemoryHex ?? "?")}`,
		);
		lines.push(
			`  disasm      ${disasm?.[0] ? `${disasm[0].address} ${disasm[0].instruction}` : "(none)"}`,
		);
		lines.push(
			`              ${disasm?.[1] ? `${disasm[1].address} ${disasm[1].instruction}` : "(none)"}`,
		);
		const setBp =
			(report.setDataBreakpoints as Array<{ verified?: boolean }> | undefined) ?? [];
		const outcome = report.dataBreakpointOutcome as
			| { event?: string; reason?: string | null; description?: string | null }
			| undefined;
		const stopAt = report.dataBreakpointStop as { name?: string; line?: number } | undefined;
		const staticBp = report.staticDataBreakpoint as
			| { name: string; dataId: string | null }
			| undefined;
		lines.push(
			`  dataBP      local ${dataBp?.name}=${dataBp?.dataId ?? "no dataId"} · static ${staticBp ? `${staticBp.name}=${staticBp.dataId ?? "no dataId"}` : "n/a"} · set=${setBp.length ? `verified=${yn(setBp[0].verified)}` : "none"}`,
		);
		lines.push(
			`              fired=${outcome?.event === "stopped" ? `${stopAt?.name ?? "?"}@${String(stopAt?.line ?? "?")} (${String(outcome.description ?? outcome.reason ?? "")}, watched=${String(report.counterAtWatchStop ?? "?")})` : String(outcome?.event ?? "n/a")} · exit=${String((report.finish as { event?: string })?.event ?? "?")}`,
		);
		const pretty = report.pretty as
			| { vec: boolean; string: boolean; optionShowsSome: boolean }
			| undefined;
		lines.push(
			`  pretty      vec=${yn(pretty?.vec)} string=${yn(pretty?.string)} option=${pretty?.optionShowsSome ? "Some" : "raw"} · stock children v=[${((report.vecChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}] s=[${((report.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
		);
		const fmt = report.rustFormatters as Json | undefined;
		if (fmt && !fmt.error) {
			lines.push(
				`  rust-lldb   vec=${String(fmt.vec ?? "?")} · children=[${((fmt.vecChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
			);
			lines.push(
				`              string=${String(fmt.string ?? "?")} · children=[${((fmt.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
			);
		} else {
			lines.push(`  rust-lldb   unverified: ${String(fmt?.error ?? "probe did not run")}`);
		}
		const failedNames = failed.map((m) => m.name).join(", ");
		lines.push(`  verdict     ${failed.length === 0 ? "PASS" : `FAIL (${failedNames})`}`);
		if (report.stderrTail && (report.stderrTail as string[]).length > 0) {
			const tail = (report.stderrTail as string[]).filter(Boolean).slice(-2);
			if (tail.length > 0) lines.push(`  stderr      ${tail.join(" | ").slice(0, 300)}`);
		}
		console.log(lines.join("\n"));
	}

	if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
	console.error(`dap-spike: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
