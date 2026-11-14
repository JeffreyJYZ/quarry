/**
 * Starting clangd the way the product starts it, and asking it what only a build-aware server can
 * answer.
 *
 * The server is given exactly the arguments the hand-off composes — `--compile-commands-dir`,
 * `--query-driver`, plus the user's own — so an answer here is the answer the app would get.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileUri, LspClient } from "../lsp-client";
import { HOVER_TIMEOUT, RESPONSE_TIMEOUT } from "./constants";
import type { AnalysisProbe } from "./fixtures/types";
import { serverPath } from "./process";
import type { Measurement } from "./types";

function hoverText(result: unknown): string | null {
	if (result === null || result === undefined) return null;
	const contents = (result as { contents?: unknown }).contents;
	const parts: string[] = [];
	const collect = (value: unknown) => {
		if (typeof value === "string") parts.push(value);
		else if (Array.isArray(value)) for (const entry of value) collect(entry);
		else if (value && typeof value === "object" && "value" in value)
			parts.push(String((value as { value: unknown }).value));
	};
	collect(contents ?? result);
	const text = parts.join("\n").replace(/\s+/g, " ").trim();
	return text === "" ? null : text;
}

/** Latest diagnostics clangd published for `uri`, as one line each. */
function diagnosticsFor(client: LspClient, uri: string): string[] {
	const published = client
		.notificationsOf("textDocument/publishDiagnostics")
		.filter((message) => message.params?.uri === uri);
	const items = published.at(-1)?.params?.diagnostics;
	if (!Array.isArray(items)) return [];
	return items.slice(0, 3).map((item: { message: string }) => item.message);
}

/** Start clangd the way the product starts it, with `args`, and answer every probe's hover. */
export async function analyse(
	binary: string,
	fixtureRoot: string,
	probes: AnalysisProbe[],
	args: string[],
): Promise<Measurement[]> {
	const client = new LspClient({ binary, cwd: fixtureRoot, args, path: serverPath(binary) });
	try {
		const id = client.request("initialize", {
			processId: process.pid,
			rootUri: fileUri(fixtureRoot),
			capabilities: { textDocument: { hover: { contentFormat: ["markdown", "plaintext"] } } },
			workspaceFolders: [{ uri: fileUri(fixtureRoot), name: basename(fixtureRoot) }],
		});
		const initialized = await client.waitForResponse(id, RESPONSE_TIMEOUT);
		if (!initialized)
			throw new Error(`clangd never answered initialize (${client.stderr.trim()})`);
		client.notify("initialized", {});

		const files = new Map<string, { uri: string; text: string }>();
		for (const probe of probes) {
			if (files.has(probe.file)) continue;
			const text = readFileSync(join(fixtureRoot, probe.file), "utf8");
			const uri = fileUri(join(fixtureRoot, probe.file));
			files.set(probe.file, { uri, text });
			client.notify("textDocument/didOpen", {
				textDocument: { uri, languageId: "cpp", version: 1, text },
			});
		}
		await client.waitForNotification("textDocument/publishDiagnostics", 1, 10_000);
		await new Promise((resolve) => setTimeout(resolve, 150));

		const measurements: Measurement[] = [];
		for (const probe of probes) {
			const file = files.get(probe.file);
			if (!file) throw new Error(`probe names an unopened file: ${probe.file}`);
			const position = positionOf(file.text, probe.needle);
			const deadline = Date.now() + HOVER_TIMEOUT;
			let hover: string | null = null;
			while (Date.now() < deadline) {
				const response = await client.ask(
					"textDocument/hover",
					{ textDocument: { uri: file.uri }, position },
					5_000,
				);
				if (response?.error) throw new Error(JSON.stringify(response.error));
				hover = hoverText(response?.result);
				if (hover) break;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			measurements.push({ hover, diagnostics: diagnosticsFor(client, file.uri) });
		}
		return measurements;
	} finally {
		client.kill();
	}
}

/** The character offset of `needle` as an LSP position. */
export function positionOf(text: string, needle: string): { line: number; character: number } {
	const index = text.indexOf(needle);
	if (index < 0) throw new Error(`needle not found in source: ${JSON.stringify(needle)}`);
	const before = text.slice(0, index);
	const line = before.split("\n").length - 1;
	return { line, character: index - before.lastIndexOf("\n") - 1 };
}
