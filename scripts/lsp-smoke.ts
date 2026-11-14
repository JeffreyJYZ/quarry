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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileUri, LspClient } from "./lsp-client";
import { findServerBinary, serverPath } from "./lsp-server";

const SERVER_BINARY = findServerBinary();
const ROOT = join(import.meta.dir, "..", "src-tauri");
const SOURCE = join(ROOT, "src", "main.rs");
const TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

async function main() {
	const client = new LspClient({
		binary: SERVER_BINARY,
		cwd: ROOT,
		path: serverPath(SERVER_BINARY),
	});
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
