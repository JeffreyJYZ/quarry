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

		// position on `run` identifier inside the call: line 4 (0-based), char 18
		const line = 4,
			character = 18;

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

		// signature help: position inside a call expression in main.rs (run())
		const shLine = 4,
			shChar = 20;
		const shId = nextId();
		client.send({
			jsonrpc: "2.0",
			id: shId,
			method: "textDocument/signatureHelp",
			params: {
				textDocument: { uri: sourceUri },
				position: { line: shLine, character: shChar },
			},
		});
		const shResp = await client.waitForResponse(shId, REQ_TIMEOUT);
		let shLabel = "none";
		let shOk = false;
		if (shResp && !shResp.error && shResp.result != null) {
			const r = shResp.result;
			const sigs = Array.isArray(r?.signatures) ? r.signatures : [];
			const active = typeof r?.activeSignature === "number" ? r.activeSignature : 0;
			if (sigs.length > 0) {
				const pick = sigs[active] ?? sigs[0];
				shLabel = pick?.label ?? "none";
				shOk = true;
			}
		}
		if (shResp?.error) {
			fatal = true;
			summary.push(`signatureHelp: FAIL ERR ${JSON.stringify(shResp.error)}`);
		} else {
			summary.push(`signatureHelp: ${shOk ? "OK" : "none"} label=${shLabel}`);
		}

		// rename at the `main` identifier
		const rnId = nextId();
		client.send({
			jsonrpc: "2.0",
			id: rnId,
			method: "textDocument/rename",
			params: {
				textDocument: { uri: sourceUri },
				position: { line, character },
				newName: "quarry_probe_rename",
			},
		});
		const rnResp = await client.waitForResponse(rnId, REQ_TIMEOUT);
		let rnShape = "none";
		let rnFiles = 0;
		let rnEdits = 0;
		let rnOk = false;
		if (rnResp && !rnResp.error && rnResp.result != null) {
			const r = rnResp.result;
			if (r?.changes && typeof r.changes === "object") rnShape = "changes";
			else if (Array.isArray(r?.documentChanges)) rnShape = "documentChanges";
			if (rnShape === "changes") {
				rnFiles = Object.keys(r.changes).length;
				for (const k of Object.keys(r.changes)) {
					rnEdits += Array.isArray(r.changes[k]) ? r.changes[k].length : 0;
				}
			} else if (rnShape === "documentChanges") {
				rnFiles = r.documentChanges.length;
				for (const dc of r.documentChanges) {
					rnEdits += Array.isArray(dc?.edits) ? dc.edits.length : 0;
				}
			}
			rnOk = rnShape !== "none";
		}
		if (rnResp?.error || !rnOk) {
			fatal = true;
			summary.push(
				`rename: FAIL ${rnResp?.error ? JSON.stringify(rnResp.error) : "no shape"}`,
			);
		} else {
			summary.push(`rename: shape=${rnShape} files=${rnFiles} edits=${rnEdits}`);
		}

		// code actions single-position range at identifier
		const caId = nextId();
		client.send({
			jsonrpc: "2.0",
			id: caId,
			method: "textDocument/codeAction",
			params: {
				textDocument: { uri: sourceUri },
				range: {
					start: { line, character },
					end: { line, character },
				},
				context: { diagnostics: [] },
			},
		});
		const caResp = await client.waitForResponse(caId, REQ_TIMEOUT);
		let caCount = 0;
		let caTitles: string[] = [];
		if (caResp && !caResp.error && Array.isArray(caResp.result)) {
			caCount = caResp.result.length;
			caTitles = caResp.result
				.slice(0, 3)
				.map((x: any) => x?.title ?? "")
				.filter((t: string) => t.length > 0);
		}
		summary.push(`codeAction: count=${caCount} titles=${JSON.stringify(caTitles)}`);
		if (caResp?.error) {
			// not fatal per spec (count zero is data), but request failure? spec: exit non-zero only failed handshake or failed sig/rename. codeAction failure not specified; treat as non-fatal data.
		}

		// call hierarchy: prepare at the same `run` identifier
		const chpId = nextId();
		client.send({
			jsonrpc: "2.0",
			id: chpId,
			method: "textDocument/prepareCallHierarchy",
			params: { textDocument: { uri: sourceUri }, position: { line, character } },
		});
		const chpResp = await client.waitForResponse(chpId, REQ_TIMEOUT);
		let chpCount = 0;
		let chpName = "none";
		let chpKind = 0;
		let chpHasSelectionRange = false;
		let chpShapeOk = false;
		let chpFirstItem: any = null;
		if (chpResp && !chpResp.error) {
			const r = chpResp.result;
			if (Array.isArray(r)) {
				chpCount = r.length;
				if (r.length > 0) {
					const it = r[0];
					chpFirstItem = it;
					chpName = it?.name ?? "none";
					chpKind = typeof it?.kind === "number" ? it.kind : 0;
					chpHasSelectionRange = !!it?.selectionRange;
				}
				chpShapeOk = true;
			} else if (r === null) {
				chpShapeOk = true;
			}
		}
		if (!chpResp || chpResp.error) {
			fatal = true;
			summary.push(
				`callHierarchy prepare: FAIL ${chpResp?.error ? JSON.stringify(chpResp.error) : "no response"}`,
			);
		} else {
			summary.push(
				`callHierarchy prepare: count=${chpCount} name=${chpName} kind=${chpKind} selectionRange=${chpHasSelectionRange} shape_ok=${chpShapeOk}`,
			);
		}

		// incoming / outgoing only when prepare returned an item
		let chInCount = 0;
		let chInKeys: string[] = [];
		let chInShapeOk = true;
		let chOutCount = 0;
		let chOutKeys: string[] = [];
		let chOutShapeOk = true;
		if (chpFirstItem) {
			// incoming
			const inId = nextId();
			client.send({
				jsonrpc: "2.0",
				id: inId,
				method: "callHierarchy/incomingCalls",
				params: { item: chpFirstItem },
			});
			const inResp = await client.waitForResponse(inId, REQ_TIMEOUT);
			if (!inResp || inResp.error) {
				fatal = true;
				chInShapeOk = false;
				summary.push(
					`callHierarchy incoming: FAIL ${inResp?.error ? JSON.stringify(inResp.error) : "no response"}`,
				);
			} else {
				const r = inResp.result;
				if (Array.isArray(r)) {
					chInCount = r.length;
					if (r.length > 0) chInKeys = Object.keys(r[0]).sort();
					chInShapeOk = true;
					if (r.length > 0) {
						const e = r[0];
						if (!e?.from || typeof e.from !== "object") chInShapeOk = false;
					}
				} else if (r === null) {
					chInShapeOk = true;
				} else {
					chInShapeOk = false;
				}
				summary.push(
					`callHierarchy incoming: count=${chInCount} keys=${JSON.stringify(chInKeys)} shape_ok=${chInShapeOk}`,
				);
			}

			// outgoing
			const outId = nextId();
			client.send({
				jsonrpc: "2.0",
				id: outId,
				method: "callHierarchy/outgoingCalls",
				params: { item: chpFirstItem },
			});
			const outResp = await client.waitForResponse(outId, REQ_TIMEOUT);
			if (!outResp || outResp.error) {
				fatal = true;
				chOutShapeOk = false;
				summary.push(
					`callHierarchy outgoing: FAIL ${outResp?.error ? JSON.stringify(outResp.error) : "no response"}`,
				);
			} else {
				const r = outResp.result;
				if (Array.isArray(r)) {
					chOutCount = r.length;
					if (r.length > 0) chOutKeys = Object.keys(r[0]).sort();
					chOutShapeOk = true;
					if (r.length > 0) {
						const e = r[0];
						if (!e?.to || typeof e.to !== "object") chOutShapeOk = false;
					}
				} else if (r === null) {
					chOutShapeOk = true;
				} else {
					chOutShapeOk = false;
				}
				summary.push(
					`callHierarchy outgoing: count=${chOutCount} keys=${JSON.stringify(chOutKeys)} shape_ok=${chOutShapeOk}`,
				);
			}
		} else {
			summary.push("callHierarchy incoming: skipped (no prepare item)");
			summary.push("callHierarchy outgoing: skipped (no prepare item)");
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
