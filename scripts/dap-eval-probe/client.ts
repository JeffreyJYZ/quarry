/**
 * The DAP transport this probe speaks: Content-Length framing over stdio, one request table, one
 * event queue, and a stderr tail kept for the failure line.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
import { spawn } from "node:child_process";

export const REQUEST_TIMEOUT_MS = 20_000;
export const EVENT_TIMEOUT_MS = 20_000;

export type Json = Record<string, unknown>;

export class DapError extends Error {}

export class DapClient {
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
