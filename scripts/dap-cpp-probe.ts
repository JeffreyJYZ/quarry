/**
 * Measured check that a C project built the way quarry builds it stops on a breakpoint.
 *
 * The bug this exists for: quarry configured CMake with no `CMAKE_BUILD_TYPE`, so a single-config
 * generator produced a binary with no debug info. lldb-dap then accepts `setBreakpoints` and never
 * stops, and the whole debugger looks dead. This probe builds the same project both ways and
 * asserts that only the configured one stops, so the regression cannot come back silently.
 *
 * Usage: bun run scripts/dap-cpp-probe.ts [--json]
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ADAPTER = "/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap";

const SOURCE = `#include <stdio.h>

int add(int a, int b) {
	int sum = a + b;
	return sum;
}

int main(void) {
	int total = add(2, 3);
	printf("%d\\n", total);
	return 0;
}
`;

const CMAKE = `cmake_minimum_required(VERSION 3.20)
project(probe C)
add_executable(probe main.c)
`;

/** The line the breakpoint goes on: the first statement inside `add`. */
const BREAKPOINT_LINE = 4;

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
					reject(
						new Error(
							`${command} failed: ${String(message.message ?? JSON.stringify(message).slice(0, 200))}`,
						),
					);
					return;
				}
				resolve(message);
			});
		});
	}

	/** The first event named `name` that arrives after `from`, or a timeout. */
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

async function build(directory: string, buildType: string | null): Promise<string> {
	const buildDir = join(directory, buildType === null ? "plain" : buildType);
	const configure = ["-S", directory, "-B", buildDir];
	if (buildType !== null) configure.push(`-DCMAKE_BUILD_TYPE=${buildType}`);
	await Bun.$`cmake ${configure}`.quiet();
	await Bun.$`cmake --build ${buildDir}`.quiet();
	return join(buildDir, "probe");
}

/** True when a breakpoint on `line` actually stops the program. */
async function stopsOnBreakpoint(program: string, cwd: string): Promise<boolean> {
	const child = Bun.spawn([ADAPTER], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
	const client = new DapClient(child);
	try {
		await client.send("initialize", {
			adapterID: "lldb",
			clientID: "quarry-probe",
			pathFormat: "path",
			linesStartAt1: true,
		});
		const before = client.seen;
		await client.send("launch", {
			program,
			args: [],
			cwd,
			stopOnEntry: false,
			initCommands: [],
		});
		await client.event("initialized", before);
		const set = await client.send("setBreakpoints", {
			source: { path: join(cwd, "main.c") },
			breakpoints: [{ line: BREAKPOINT_LINE }],
			sourceModified: false,
		});
		const body = (set.body ?? {}) as { breakpoints?: { verified?: boolean }[] };
		const verified = body.breakpoints?.[0]?.verified === true;
		await client.send("configurationDone", {});
		const stopped = await Promise.race([
			client.event("stopped", before).then(() => true),
			Bun.sleep(5_000).then(() => false),
		]);
		return verified && stopped;
	} finally {
		await client.stop();
	}
}

async function main(): Promise<void> {
	const directory = mkdtempSync(join(tmpdir(), "quarry-cpp-"));
	writeFileSync(join(directory, "main.c"), SOURCE);
	writeFileSync(join(directory, "CMakeLists.txt"), CMAKE);

	const plain = await build(directory, null);
	const debug = await build(directory, "Debug");

	const plainStops = await stopsOnBreakpoint(plain, directory);
	const debugStops = await stopsOnBreakpoint(debug, directory);

	const ok = debugStops && !plainStops;
	console.log(
		`dap-cpp  plain=${plainStops ? "stopped" : "no-stop"}  debug=${debugStops ? "stopped" : "no-stop"}`,
	);
	console.log(`dap-cpp  verdict ${ok ? "PASS" : "FAIL"}`);
	process.exit(ok ? 0 : 1);
}

main().catch((error) => {
	console.error(`dap-cpp: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
