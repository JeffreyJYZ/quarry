/**
 * The LSP UX smoke run: one rust-analyzer session, every feature the dock uses, in the order the
 * summary has always printed.
 *
 * The probes live beside this file, one per feature; each reports its own lines and whether a refusal
 * is fatal, so the run can keep going and still fail at the end.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileUri, LspClient } from "../lsp-client";
import { findServerBinary, serverPath } from "../lsp-server";
import { probeCallHierarchy } from "./call-hierarchy";
import { probeCodeActions } from "./code-actions";
import { probeCompletion } from "./completion";
import { probeHighlight } from "./highlight";
import { probeHover } from "./hover";
import { probeInlayHints } from "./inlay";
import { probeNavigation } from "./navigation";
import { POSITION, type ProbeResult, REQ_TIMEOUT } from "./requests";
import { probeRename } from "./rename";
import { probeSignature, probeSignatureShape } from "./signature";

const SERVER_BINARY = findServerBinary();
const ROOT = join(import.meta.dir, "..", "..", "src-tauri");
const SOURCE = join(ROOT, "src", "main.rs");

export async function runSmoke(): Promise<void> {
	const client = new LspClient({
		binary: SERVER_BINARY,
		cwd: ROOT,
		path: serverPath(SERVER_BINARY),
	});
	const rootUri = fileUri(ROOT);
	const sourceUri = fileUri(SOURCE);
	let fatal = false;
	const summary: string[] = [];
	const record = (result: ProbeResult) => {
		summary.push(...result.lines);
		fatal ||= result.fatal;
	};

	try {
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

		record(await probeHover(client, sourceUri, POSITION));
		record(await probeCompletion(client, sourceUri, POSITION));
		record(await probeNavigation(client, sourceUri, POSITION));
		record(await probeSignature(client, sourceUri));
		record(await probeRename(client, sourceUri, POSITION));
		record(await probeCodeActions(client, sourceUri, POSITION));
		record(await probeCallHierarchy(client, sourceUri, POSITION));
		record(await probeHighlight(client, sourceUri, POSITION));
		record(await probeInlayHints(client, sourceUri));
		record(await probeSignatureShape(client, sourceUri));
	} finally {
		client.kill();
	}
	console.log("=== LSP UX SMOKE ===");
	for (const line of summary) console.log(line);
	console.log("====================");
	if (fatal) process.exit(1);
}
