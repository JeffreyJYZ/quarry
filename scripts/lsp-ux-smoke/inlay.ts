/**
 * Inlay hints over the top of the open document: the dock renders them as ghosts, so the label may
 * arrive as a string or as labelled parts and both must be understood.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeInlayHints(client: LspClient, uri: string): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/inlayHint",
		{
			textDocument: { uri },
			range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
		},
		REQ_TIMEOUT,
	);
	let count = 0;
	let labelKind = "none";
	let shapeOk = false;
	if (response && !response.error) {
		const result = response.result;
		if (result === null) {
			shapeOk = true;
		} else if (Array.isArray(result)) {
			count = result.length;
			shapeOk = true;
			if (result.length > 0) {
				const label = result[0]?.label;
				if (typeof label === "string") labelKind = "string";
				else if (Array.isArray(label)) labelKind = "parts";
				else labelKind = "other";
			}
		} else {
			shapeOk = false;
		}
	}
	if (!response || response.error) {
		return {
			fatal: true,
			lines: [
				`inlayHint: FAIL ${response?.error ? JSON.stringify(response.error) : "no response"}`,
			],
		};
	}
	return {
		fatal: false,
		lines: [`inlayHint: count=${count} firstLabel=${labelKind} shape_ok=${shapeOk}`],
	};
}
