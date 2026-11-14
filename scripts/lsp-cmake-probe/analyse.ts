/**
 * One analysis run: initialize, open the file, wait for diagnostics and one hover.
 *
 * Everything clangd said is kept, because a run that reports zero errors for the wrong reason and a
 * run that reports none for the right one look identical from the outside.
 */

import { readFileSync } from "node:fs";
import { fileUri, LspClient } from "../lsp-client";
import { HOVER_MARKER, HOVER_TOKEN } from "./fixture";

type Json = Record<string, unknown>;

export interface Analysis {
	errors: number;
	said: string;
	hover: string;
	stderr: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How many errors clangd last published for `uri`. */
function errorsFor(client: LspClient, uri: string): Json[] {
	const published = client.notifications.filter(
		(note) => note.method === "textDocument/publishDiagnostics",
	);
	const own = published.filter((note) => (note.params as Json | undefined)?.uri === uri);
	const last = own.at(-1)?.params as { diagnostics?: Json[] } | undefined;
	return (last?.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === 1);
}

function summary(reported: Json[]): string {
	if (reported.length === 0) return "clean";
	return reported.map((diagnostic) => String(diagnostic.message ?? "")).join(" | ");
}

export async function analyse(
	binary: string,
	project: string,
	args: string[],
	source: string,
	uri: string,
): Promise<Analysis> {
	const client = new LspClient({ binary, cwd: project, args });
	try {
		const rootUri = fileUri(project);
		client.send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				processId: process.pid,
				rootUri,
				capabilities: {
					textDocument: { hover: { contentFormat: ["markdown", "plaintext"] } },
				},
				workspaceFolders: [{ uri: rootUri, name: "teacher_demo" }],
			},
		});
		const ready = Date.now() + 20_000;
		while (Date.now() < ready && !client.responses.some((response) => response.id === 1)) {
			await sleep(50);
		}
		if (!client.responses.some((response) => response.id === 1)) {
			return { errors: -1, said: "no initialize response", hover: "", stderr: client.stderr };
		}

		client.send({ jsonrpc: "2.0", method: "initialized", params: {} });
		client.send({
			jsonrpc: "2.0",
			method: "textDocument/didOpen",
			params: {
				textDocument: {
					uri,
					languageId: "cpp",
					version: 1,
					text: readFileSync(source, "utf8"),
				},
			},
		});

		const published = Date.now() + 20_000;
		while (
			Date.now() < published &&
			!client.notifications.some((note) => note.method === "textDocument/publishDiagnostics")
		) {
			await sleep(50);
		}
		// A second publish follows the first once the preamble has been parsed.
		await sleep(1_200);

		const texts = readFileSync(source, "utf8").split("\n");
		const line = texts.findIndex((entry) => entry.includes(HOVER_MARKER));
		const character = (texts[line] ?? "").indexOf(HOVER_TOKEN);
		client.send({
			jsonrpc: "2.0",
			id: 2,
			method: "textDocument/hover",
			params: { textDocument: { uri }, position: { line, character } },
		});
		const hovered = Date.now() + 15_000;
		while (Date.now() < hovered && !client.responses.some((response) => response.id === 2)) {
			await sleep(50);
		}
		const hover = client.responses.find((response) => response.id === 2)?.result;
		const reported = errorsFor(client, uri);
		return {
			errors: reported.length,
			said: summary(reported),
			hover: JSON.stringify(hover ?? null),
			stderr: client.stderr,
		};
	} finally {
		client.kill();
	}
}
