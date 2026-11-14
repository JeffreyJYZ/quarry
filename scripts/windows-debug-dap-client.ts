#!/usr/bin/env bun
/**
 * A DAP client that keeps every message it saw, so a CI log diagnoses itself.
 *
 * Transport only: framing, request correlation, the child's streams, and its exit. What a failure
 * looks like is `windows-debug-dap-report.ts`, because the one thing this row must never do is lose
 * the reason a process died — an adapter that ends at startup answers nothing, and its stderr is
 * where it said why.
 */

import { describeExit } from "./windows-debug-adapter";
import { readFrames } from "./windows-debug-dap-frames";
import { type Exchange, type SessionTrace, stderrTail } from "./windows-debug-dap-report";

type Json = Record<string, unknown>;

/** How long one request may take; a Windows launch starts a process the first time. */
const REQUEST_TIMEOUT = 30_000;

/** How often the client looks for an event the adapter already sent. */
const POLL = 20;

export class DapClient implements SessionTrace {
	readonly log: Exchange[] = [];
	readonly errors: string[] = [];
	/** The command line and directory the adapter was started with, quoted on failure. */
	readonly spawn: string;
	private readonly decoder = new TextDecoder();
	private readonly errorDecoder = new TextDecoder();
	private readonly pending = new Map<number, (message: Json) => void>();
	private readonly child: ReturnType<typeof Bun.spawn>;
	private readonly readers: Promise<void>[];
	private finished: number | null = null;
	private buffer = "";
	private seq = 0;

	/** Start one adapter in `cwd`, which is the directory the product launches it in. */
	constructor(adapter: string, cwd: string) {
		this.spawn = `${adapter} (cwd ${cwd})`;
		this.child = Bun.spawn([adapter], {
			cwd,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		void this.child.exited.then((code) => {
			this.finished = code;
		});
		// Both reader loops are kept so a failure can wait for them: an adapter's last words arrive
		// on a stream, not in its exit status, and a startup death is exactly when that matters.
		this.readers = [this.read(), this.readErrors()];
	}

	/** The status the adapter left, once it has ended. */
	get exit(): number | null {
		return this.finished;
	}

	/** The index of the next message, which is an assertion's window start. */
	mark(): number {
		return this.log.length;
	}

	/**
	 * Send one request and wait for its response, or fail with the reason it will never come.
	 *
	 * The wait races the child as well as the clock: an adapter that dies at startup answers nothing,
	 * and calling that a 30 s timeout hides the one fact that matters — it is gone, with a status.
	 */
	send(command: string, arguments_: Json = {}): Promise<Json> {
		this.seq += 1;
		const seq = this.seq;
		const request = { seq, type: "request", command, arguments: arguments_ };
		this.log.push({ kind: "request", message: request });
		const payload = JSON.stringify(request);
		const bytes = new TextEncoder().encode(
			`Content-Length: ${payload.length}\r\n\r\n${payload}`,
		);
		void (this.child.stdin as import("bun").FileSink).write(bytes);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`${command}: no response within ${REQUEST_TIMEOUT}ms`)),
				REQUEST_TIMEOUT,
			);
			this.pending.set(seq, (message) => {
				clearTimeout(timer);
				if (message.success === false) {
					reject(new Error(`${command} was refused: ${refusal(message)}`));
					return;
				}
				resolve(message);
			});
			void this.child.exited.then(async (code) => {
				clearTimeout(timer);
				this.pending.delete(seq);
				await this.settle();
				const said = stderrTail(this.errors).join(" ");
				reject(
					new Error(
						`${command} was never answered: the adapter exited ${describeExit(code)}` +
							(said === "" ? "; it printed nothing" : `; it said: ${said}`),
					),
				);
			});
		});
	}

	/** The first event named `name` at or after `from`, or a timeout that names what did arrive. */
	async event(name: string, from: number): Promise<Json> {
		return await this.eventAmong([name], from);
	}

	/** The first event named any of `names`, in the order they arrived. */
	async eventAmong(names: string[], from: number): Promise<Json> {
		const deadline = Date.now() + REQUEST_TIMEOUT;
		for (;;) {
			for (const { kind, message } of this.log.slice(from)) {
				if (kind === "event" && names.includes(String(message.event))) return message;
			}
			if (Date.now() > deadline) {
				const seen = this.log
					.slice(from)
					.filter((entry) => entry.kind === "event")
					.map((entry) => String(entry.message.event));
				throw new Error(`no ${names.join(" or ")} event; saw ${seen.join(", ") || "none"}`);
			}
			await Bun.sleep(POLL);
		}
	}

	/** Wait for the adapter to end on its own, then for its streams, so nothing it said is lost. */
	async waitForExit(timeoutMs = 10_000): Promise<number | null> {
		this.finished ??= await Promise.race([
			this.child.exited,
			Bun.sleep(timeoutMs).then(() => null),
		]);
		await this.settle();
		return this.finished;
	}

	/** Wait for both reader loops to end; a dead child's streams end within a moment. */
	async settle(timeoutMs = 2000): Promise<void> {
		await Promise.race([
			Promise.allSettled(this.readers),
			Bun.sleep(timeoutMs).then(() => undefined),
		]);
	}

	/** Kill the adapter and wait, so no child outlives the row. */
	async stop(): Promise<number | null> {
		this.child.kill();
		return await this.waitForExit();
	}

	private async read(): Promise<void> {
		const stream = this.child.stdout as ReadableStream<Uint8Array>;
		for await (const chunk of stream) {
			this.buffer += this.decoder.decode(chunk, { stream: true });
			const { messages, rest } = readFrames(this.buffer);
			this.buffer = rest;
			for (const message of messages) this.accept(message);
		}
	}

	private async readErrors(): Promise<void> {
		const stream = this.child.stderr as ReadableStream<Uint8Array>;
		for await (const chunk of stream) {
			this.errors.push(this.errorDecoder.decode(chunk, { stream: true }));
		}
	}

	private accept(message: Json): void {
		if (message.type === "response") {
			this.log.push({ kind: "response", message });
			const id = Number(message.request_seq);
			this.pending.get(id)?.(message);
			this.pending.delete(id);
			return;
		}
		if (message.type === "event") this.log.push({ kind: "event", message });
	}
}

/** A refused request's cause: the adapter's message and body, whichever it filled in. */
function refusal(message: Json): string {
	const text = typeof message.message === "string" ? message.message : "no message";
	const body = message.body === undefined ? "" : ` ${JSON.stringify(message.body)}`;
	return `${text}${body}`;
}
