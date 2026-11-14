#!/usr/bin/env bun
/**
 * A DAP client that keeps every message it saw, so a CI log diagnoses itself.
 *
 * The row asserts something and, when the assertion fails, prints the request and the response that
 * produced it — not a summary. So every message travels through one log, in arrival order, and the
 * caller reports the window its assertion occupied. lldb-dap's own stderr is kept beside it: on
 * Windows a refused launch says why there, and the DAP response only says `failed`.
 */

type Json = Record<string, unknown>;

/** One message the client sent or saw, in the order it crossed the pipe. */
export interface Exchange {
	kind: "request" | "response" | "event";
	message: Json;
}

/** How long one request may take; a Windows launch starts a process the first time. */
const REQUEST_TIMEOUT = 30_000;

/** How often the client looks for an event the adapter already sent. */
const POLL = 20;

export class DapClient {
	private readonly decoder = new TextDecoder();
	private readonly errorDecoder = new TextDecoder();
	private readonly log: Exchange[] = [];
	private readonly errors: string[] = [];
	private readonly pending = new Map<number, (message: Json) => void>();
	private readonly child: ReturnType<typeof Bun.spawn>;
	private buffer = "";
	private seq = 0;

	/** Start one adapter in `cwd`, which is the directory the product launches it in. */
	constructor(adapter: string, cwd: string) {
		this.child = Bun.spawn([adapter], {
			cwd,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		void this.read();
		void this.readErrors();
	}

	/** The index of the next message, which is an assertion's window start. */
	mark(): number {
		return this.log.length;
	}

	/** Send one request and wait for its response, or fail with the request's own name. */
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

	/** The messages between two marks, untruncated: a failure quotes the exchange exactly. */
	report(from: number, to: number = this.log.length): string[] {
		return this.log.slice(from, to).map(({ kind, message }) => {
			const arrow = kind === "request" ? "→" : kind === "response" ? "←" : "•";
			return `${arrow} ${JSON.stringify(message)}`;
		});
	}

	/** lldb-dap's own last words, which carry the cause a refused request does not. */
	stderrLines(limit = 12): string[] {
		return this.errors.flatMap((chunk) => chunk.split(/\r?\n/)).slice(-limit);
	}

	/** How many events of one name arrived at or after `from`. */
	eventsSince(name: string, from: number): number {
		return this.log
			.slice(from)
			.filter((entry) => entry.kind === "event" && entry.message.event === name).length;
	}

	/** Wait for the adapter to end on its own; null when it is still alive at the deadline. */
	async waitForExit(timeoutMs = 10_000): Promise<number | null> {
		return await Promise.race([this.child.exited, Bun.sleep(timeoutMs).then(() => null)]);
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
			this.drain();
		}
	}

	private async readErrors(): Promise<void> {
		const stream = this.child.stderr as ReadableStream<Uint8Array>;
		for await (const chunk of stream) {
			this.errors.push(this.errorDecoder.decode(chunk, { stream: true }));
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
			this.accept(JSON.parse(body) as Json);
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
