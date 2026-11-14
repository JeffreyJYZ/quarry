/**
 * The DAP transport this probe speaks, built on `Bun.spawn` so the read loop is an async iterator
 * rather than a socket callback.
 *
 * A response resolves with its `body`; a failure rejects with the adapter's message, which is the
 * reading this probe reports.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
export type Json = Record<string, unknown>;

export class DapClient {
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
