/**
 * The JSON-RPC transport every probe under `scripts/` speaks to a language server.
 *
 * It was lifted out of `lsp-ux-smoke.ts` unchanged so the C/C++ parity probe drives clangd through
 * the same client the Rust smoke test drives rust-analyzer through: one framing, one response
 * matcher, one kill path.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import { type ChildProcess, spawn } from "node:child_process";

/** A local path as an LSP `file://` URI: everything outside the unreserved set is percent-encoded. */
export function fileUri(path: string): string {
	// A Windows path needs the third slash before its drive letter, and the server expects forward
	// slashes; on every other platform the path is already the URI's path.
	const source = process.platform === "win32" ? `/${path.replaceAll("\\", "/")}` : path;
	let uri = "file://";
	for (const byte of Buffer.from(source, "utf8")) {
		if (
			(byte >= 0x41 && byte <= 0x5a) ||
			(byte >= 0x61 && byte <= 0x7a) ||
			(byte >= 0x30 && byte <= 0x39) ||
			byte === 0x2d ||
			byte === 0x2e ||
			byte === 0x5f ||
			byte === 0x7e ||
			byte === 0x2f
		) {
			uri += String.fromCharCode(byte);
		} else {
			uri += `%${byte.toString(16).padStart(2, "0").toUpperCase()}`;
		}
	}
	return uri;
}

export interface LspClientOptions {
	/** Server binary to spawn. */
	binary: string;
	/** Working directory the server runs in, which is where a project-aware server looks first. */
	cwd: string;
	/** Arguments handed to the server. */
	args?: string[];
	/** Value for the child's `PATH`; a server resolved outside `PATH` needs its own bin dir first. */
	path?: string;
}

export class LspClient {
	child: ChildProcess;
	buffer = Buffer.alloc(0);
	stderr = "";
	notifications: any[] = [];
	responses: any[] = [];
	exited = false;

	constructor(options: LspClientOptions) {
		const env = options.path ? { ...process.env, PATH: options.path } : process.env;
		this.child = spawn(options.binary, options.args ?? [], {
			cwd: options.cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stdout?.on("data", (c: Buffer) => this.onData(c));
		this.child.stderr?.on("data", (c: Buffer) => {
			this.stderr += c.toString("utf8");
		});
		this.child.on("exit", (code, signal) => {
			this.exited = true;
			this.stderr += `\n[exit code=${code} signal=${signal}]\n`;
		});
	}

	send(message: any) {
		const body = JSON.stringify(message);
		this.child.stdin?.write(
			`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
		);
	}

	/** Send a request and return its id, for a matching [`waitForResponse`]. */
	request(method: string, params: any, id: number = this.nextId()): number {
		this.send({ jsonrpc: "2.0", id, method, params });
		return id;
	}

	/** Send a notification; a server never answers one. */
	notify(method: string, params: any) {
		this.send({ jsonrpc: "2.0", method, params });
	}

	/** The full response object for `id`, or null once `timeout` elapses or the server exits. */
	async waitForResponse(id: number, timeout: number): Promise<any> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const found = this.responses.find((x) => x.id === id);
			if (found) return found;
			if (this.exited) return null;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return null;
	}

	/** One request round trip: the response object, or null when the server stays silent. */
	ask(method: string, params: any, timeout: number): Promise<any> {
		return this.waitForResponse(this.request(method, params), timeout);
	}

	/** Every notification `method` has produced so far, oldest first. */
	notificationsOf(method: string): any[] {
		return this.notifications.filter((message) => message.method === method);
	}

	/** Poll until `method` has produced `count` notifications, or `timeout` elapses. */
	async waitForNotification(method: string, count: number, timeout: number): Promise<any[]> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const found = this.notificationsOf(method);
			if (found.length >= count) return found;
			if (this.exited) break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return this.notificationsOf(method);
	}

	/** Reserve the next request id; starts high so a hand-written id in a probe cannot collide. */
	private counter = 100;
	nextId(): number {
		return this.counter++;
	}

	kill() {
		if (this.exited) return;
		try {
			this.child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}

	private onData(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const he = this.buffer.indexOf("\r\n\r\n");
			if (he < 0) return;
			const header = this.buffer.subarray(0, he).toString("ascii");
			const match = /Content-Length:\s*(\d+)/i.exec(header);
			if (!match) return;
			const len = Number(match[1]);
			const start = he + 4;
			if (this.buffer.length < start + len) return;
			const raw = this.buffer.subarray(start, start + len).toString("utf8");
			this.buffer = this.buffer.subarray(start + len);
			try {
				const message = JSON.parse(raw);
				if (message.method === undefined) this.responses.push(message);
				else this.notifications.push(message);
			} catch {
				// A frame that is not JSON is not ours to interpret; the next frame still parses.
			}
		}
	}
}
