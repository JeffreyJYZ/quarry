#!/usr/bin/env bun
// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SERVER_BINARY = "/opt/homebrew/opt/rustup/bin/rust-analyzer";
const ROOT = join(import.meta.dir, "..", "src-tauri");
const SOURCE = join(ROOT, "src", "main.rs");
const REQ_TIMEOUT = 20_000;
const INDEX_TIMEOUT = 30_000;

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
	child: ChildProcess;
	buffer = Buffer.alloc(0);
	stderr = "";
	notifications: any[] = [];
	responses: any[] = [];
	exited = false;
	constructor(binary: string) {
		this.child = spawn(binary, [], {
			cwd: ROOT,
			env: { ...process.env, PATH: serverPath(binary) },
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
	send(m: any) {
		const body = JSON.stringify(m);
		this.child.stdin?.write(
			`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`,
		);
	}
	private onData(chunk: Buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const he = this.buffer.indexOf("\r\n\r\n");
			if (he < 0) return;
			const header = this.buffer.subarray(0, he).toString("ascii");
			const m = /Content-Length:\s*(\d+)/i.exec(header);
			if (!m) return;
			const len = Number(m[1]);
			const start = he + 4;
			if (this.buffer.length < start + len) return;
			const raw = this.buffer.subarray(start, start + len).toString("utf8");
			this.buffer = this.buffer.subarray(start + len);
			try {
				const msg = JSON.parse(raw);
				if (msg.method === undefined) this.responses.push(msg);
				else this.notifications.push(msg);
			} catch {}
		}
	}
	kill() {
		if (!this.exited)
			try {
				this.child.kill("SIGKILL");
			} catch {}
	}
	async waitForResponse(id: number, timeout: number): Promise<any> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const r = this.responses.find((x) => x.id === id);
			if (r) return r;
			if (this.exited) return null;
			await new Promise((r) => setTimeout(r, 50));
		}
		return null;
	}
}

let reqId = 100;
function nextId() {
	return reqId++;
}

async function main() {
	const client = new LspClient(SERVER_BINARY);
	const rootUri = fileUri(ROOT);
	const sourceUri = fileUri(SOURCE);
	let fatal = false;
	const summary: string[] = [];
	try {
		// initialize
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
		const initResp = await client.waitForResponse(1, REQ_TIMEOUT);
		if (!initResp) {
			console.error("no initialize response");
			process.exit(1);
		}
		client.send({ jsonrpc: "2.0", method: "initialized", params: {} });
		const text = readFileSync(SOURCE, "utf8");
		client.send({
			jsonrpc: "2.0",
			method: "textDocument/didOpen",
			params: { textDocument: { uri: sourceUri, languageId: "rust", version: 1, text } },
		});

		// position on `main` identifier: line 4 (1-based) => 0-based 3, char 3
		const line = 4,
			character = 4;

		// poll hover until non-null
		let hoverResp: any = null;
		const hoverDeadline = Date.now() + INDEX_TIMEOUT;
		while (Date.now() < hoverDeadline) {
			const id = nextId();
			client.send({
				jsonrpc: "2.0",
				id,
				method: "textDocument/hover",
				params: { textDocument: { uri: sourceUri }, position: { line, character } },
			});
			const r = await client.waitForResponse(id, 5000);
			if (r && r.result != null) {
				hoverResp = r;
				break;
			}
			if (r) hoverResp = r;
			await new Promise((r) => setTimeout(r, 2000));
		}
		const hoverOk = !!hoverResp && hoverResp.result != null && !hoverResp.error;
		summary.push(`hover: ${hoverOk ? "OK" : "FAIL"}`);
		if (!hoverOk) {
			fatal = true;
			if (hoverResp) summary.push(`  hover raw: ${JSON.stringify(hoverResp).slice(0, 500)}`);
		}

		// completion
		const cid = nextId();
		client.send({
			jsonrpc: "2.0",
			id: cid,
			method: "textDocument/completion",
			params: {
				textDocument: { uri: sourceUri },
				position: { line, character },
				context: { triggerKind: 1 },
			},
		});
		const compResp = await client.waitForResponse(cid, REQ_TIMEOUT);
		let compOk = false;
		let isIncomplete = false;
		let labels: string[] = [];
		let compShape = "none";
		if (compResp && !compResp.error && compResp.result != null) {
			const res = compResp.result;
			if (Array.isArray(res)) {
				compShape = "array";
				labels = res.slice(0, 5).map((x: any) => x.label);
				compOk = true;
			} else if (res && Array.isArray(res.items)) {
				compShape = "CompletionList";
				isIncomplete = !!res.isIncomplete;
				labels = res.items.slice(0, 5).map((x: any) => x.label);
				compOk = true;
			}
		}
		summary.push(
			`completion: ${compOk ? "OK" : "FAIL"} shape=${compShape} isIncomplete=${isIncomplete} labels=${JSON.stringify(labels)}`,
		);
		if (!compOk) {
			fatal = true;
			if (compResp)
				summary.push(`  completion raw: ${JSON.stringify(compResp).slice(0, 500)}`);
		}

		// definition
		const did = nextId();
		client.send({
			jsonrpc: "2.0",
			id: did,
			method: "textDocument/definition",
			params: { textDocument: { uri: sourceUri }, position: { line, character } },
		});
		const defResp = await client.waitForResponse(did, REQ_TIMEOUT);
		let defShape = "none";
		let defCount = 0;
		let defExample: any = null;
		if (defResp && !defResp.error && defResp.result != null) {
			const r = defResp.result;
			if (Array.isArray(r)) {
				if (r.length && r[0].targetUri) defShape = "LocationLink[]";
				else defShape = "Location[]";
			} else if (r && (r.uri || r.targetUri)) {
				defShape = r.targetUri ? "LocationLink" : "Location";
			}
			defCount = Array.isArray(r) ? r.length : 1;
			defExample = Array.isArray(r) ? r[0] : r;
		}
		summary.push(
			`definition: shape=${defShape} count=${defCount} ${defResp?.error ? `ERR ${JSON.stringify(defResp.error)}` : ""}`,
		);

		// references
		const rid = nextId();
		client.send({
			jsonrpc: "2.0",
			id: rid,
			method: "textDocument/references",
			params: {
				textDocument: { uri: sourceUri },
				position: { line, character },
				context: { includeDeclaration: true },
			},
		});
		const refResp = await client.waitForResponse(rid, REQ_TIMEOUT);
		let refCount = 0;
		if (refResp && !refResp.error && Array.isArray(refResp.result))
			refCount = refResp.result.length;
		summary.push(
			`references: count=${refCount} ${refResp?.error ? `ERR ${JSON.stringify(refResp.error)}` : ""}`,
		);

		// print one example raw for definition if needed? only if unhandled shape
		// Check handled shapes per lsp.rs:
		// hover: string | MarkupContent | MarkedString | array -> handled
		// definition: Location | Location[] | LocationLink[] -> handled (parse_location handles uri/targetUri, range/targetSelectionRange/targetRange)
		// completion: CompletionList or array -> handled
		// references: array of Location -> handled
		// So no unhandled expected; but print definition example raw for verification
		if (defExample) {
			summary.push(`definition example: ${JSON.stringify(defExample).slice(0, 600)}`);
		}
	} finally {
		client.kill();
	}
	console.log("=== LSP UX SMOKE ===");
	for (const l of summary) console.log(l);
	console.log("====================");
	if (fatal) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
