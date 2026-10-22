#!/usr/bin/env bun
/**
 * LSP smoke test for quarry.
 *
 * Spawns rust-analyzer with the same environment shape `lsp.rs` uses, runs the
 * `initialize` / `initialized` / `textDocument/didOpen` handshake and prints the
 * server's answer, its first notifications and everything it wrote to stderr.
 *
 * A server that dies at startup says why on stderr, so that output is the whole
 * point of this script: a bare "no initialize response" hides the real reason.
 *
 * Usage: bun run scripts/lsp-smoke.ts
 */

import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SERVER_BINARY = "/opt/homebrew/opt/rustup/bin/rust-analyzer";
const ROOT = join(import.meta.dir, "..", "src-tauri");
const SOURCE = join(ROOT, "src", "main.rs");
const TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

/** The prefix list `server_path` in `src-tauri/src/lsp.rs` builds, in the same order. */
function serverPath(binary: string): string {
	const dirs = [
		dirname(binary),
		"/opt/homebrew/opt/rustup/bin",
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
	];
	const inherited = (process.env.PATH ?? "").split(":").filter(Boolean);
	return [...dirs, ...inherited].join(":");
}

/** Percent-encode a path into a `file://` URI, one byte at a time. */
function fileUri(path: string): string {
	let uri = "file://";
	for (const byte of Buffer.from(path, "utf8")) {
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

class LspClient {
	private child: ChildProcess;
	private buffer = Buffer.alloc(0);
	private stderr = "";
	readonly notifications: Json[] = [];
	readonly responses: Json[] = [];
	exited = false;

	constructor(binary: string) {
		this.child = spawn(binary, [], {
			cwd: ROOT,
			env: { ...process.env, PATH: serverPath(binary) },
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stdout?.on("data", (chunk: Buffer) => this.onData(chunk));
		this.child.stderr?.on("data", (chunk: Buffer) => {
			this.stderr += chunk.toString("utf8");
		});
		this.child.on("exit", (code, signal) => {
			this.exited = true;
			this.stderr += `\n[child exited code=${code ?? "null"} signal=${signal ?? "null"}]\n`;
		});
		this.child.on("error", (error) => {
			this.stderr += `\n[child error: ${error.message}]\n`;
		});
	}

	send(message: Json) {
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
				this.stderr += `\n[malformed header: ${JSON.stringify(header)}]\n`;
				return;
			}
			const length = Number(match[1]);
			const start = headerEnd + 4;
			if (this.buffer.length < start + length) return;
			const raw = this.buffer.subarray(start, start + length).toString("utf8");
			this.buffer = this.buffer.subarray(start + length);
			try {
				const message = JSON.parse(raw) as Json;
				if (message.method === undefined) this.responses.push(message);
				else this.notifications.push(message);
			} catch {
				this.stderr += `\n[unparseable payload: ${raw.slice(0, 200)}]\n`;
			}
		}
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

async function main() {
	const client = new LspClient(SERVER_BINARY);
	const rootUri = fileUri(ROOT);
	let initialize: Json | undefined;
	let failure: string | undefined;

	try {
		const timer = setTimeout(() => {
			failure ??= `no initialize response within ${TIMEOUT_MS}ms`;
		}, TIMEOUT_MS);

		client.send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				processId: process.pid,
				rootUri,
				capabilities: {
					textDocument: {
						hover: { contentFormat: ["markdown", "plaintext"] },
						completion: { completionItem: { snippetSupport: false } },
						definition: { linkSupport: true },
					},
				},
				workspaceFolders: [{ uri: rootUri, name: "src-tauri" }],
			},
		});

		const deadline = Date.now() + TIMEOUT_MS;
		while (Date.now() < deadline) {
			initialize = client.responses.find((response) => response.id === 1);
			if (initialize) break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		clearTimeout(timer);

		if (!initialize) {
			failure ??= `no initialize response within ${TIMEOUT_MS}ms`;
		} else {
			client.send({ jsonrpc: "2.0", method: "initialized", params: {} });
			const text = readFileSync(SOURCE, "utf8");
			client.send({
				jsonrpc: "2.0",
				method: "textDocument/didOpen",
				params: {
					textDocument: {
						uri: fileUri(SOURCE),
						languageId: "rust",
						version: 1,
						text,
					},
				},
			});
			// Give the server a moment to answer a request of its own or to publish.
			await new Promise((resolve) => setTimeout(resolve, 1_500));
		}
	} finally {
		client.kill();
	}

	const lines: string[] = [];
	lines.push("LSP smoke — rust-analyzer");
	lines.push(`  binary      ${SERVER_BINARY}`);
	lines.push(`  root        ${ROOT}`);
	lines.push(`  rootUri     ${rootUri}`);
	lines.push(`  initialize  ${initialize ? "answered" : "NO RESPONSE"}`);
	if (initialize) {
		const result = initialize.result as Json | undefined;
		const capabilities = result?.capabilities as Json | undefined;
		lines.push(`  serverInfo  ${JSON.stringify(result?.serverInfo ?? null)}`);
		lines.push(
			`  caps        ${capabilities ? Object.keys(capabilities).length : 0} server capability keys`,
		);
	}
	if (initialize?.error) lines.push(`  error       ${JSON.stringify(initialize.error)}`);
	lines.push(`  stderr      ${client.stderr.trim() === "" ? "(empty)" : "see below"}`);
	for (const notification of client.notifications.slice(0, 5)) {
		lines.push(`  notify      ${String(notification.method)}`);
	}
	console.log(lines.join("\n"));
	if (client.stderr.trim() !== "") {
		console.log("--- stderr ---");
		console.log(client.stderr.trim());
		console.log("--- end stderr ---");
	}

	if (failure) {
		console.error(`lsp-smoke: ${failure}`);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(`lsp-smoke: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
