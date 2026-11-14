/**
 * The DAP transport: Content-Length framing over stdio, one request table, one event queue.
 *
 * The adapter asks questions of its own (`runInTerminal`, `startDebugging`), and this spike answers
 * them instead of deadlocking, because the program runs on the adapter's own console. They are
 * recorded so the report can name what was asked for.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EVENT_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "./constants";
import type { DapEvent, Json } from "./state";

export class DapError extends Error {}

export class DapClient {
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
