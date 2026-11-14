/**
 * Completion, reported by shape: an array and a `CompletionList` are both legal answers to the same
 * request, and the dock has to handle each.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeCompletion(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/completion",
		{
			textDocument: { uri },
			position,
			context: { triggerKind: 1 },
		},
		REQ_TIMEOUT,
	);
	let ok = false;
	let isIncomplete = false;
	let labels: string[] = [];
	let shape = "none";
	if (response && !response.error && response.result != null) {
		const result = response.result;
		if (Array.isArray(result)) {
			shape = "array";
			labels = result.slice(0, 5).map((x: any) => x.label);
			ok = true;
		} else if (result && Array.isArray(result.items)) {
			shape = "CompletionList";
			isIncomplete = !!result.isIncomplete;
			labels = result.items.slice(0, 5).map((x: any) => x.label);
			ok = true;
		}
	}
	const lines = [
		`completion: ${ok ? "OK" : "FAIL"} shape=${shape} isIncomplete=${isIncomplete} labels=${JSON.stringify(labels)}`,
	];
	if (!ok && response) lines.push(`  completion raw: ${JSON.stringify(response).slice(0, 500)}`);
	return { fatal: !ok, lines };
}
