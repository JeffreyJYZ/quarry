/**
 * Code actions at a single-position range.
 *
 * A count of zero is data, so a refused request is reported but never fails the probe: rust-analyzer
 * legitimately has nothing to offer on an identifier whose range is empty.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeCodeActions(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/codeAction",
		{
			textDocument: { uri },
			range: {
				start: position,
				end: position,
			},
			context: { diagnostics: [] },
		},
		REQ_TIMEOUT,
	);
	let count = 0;
	let titles: string[] = [];
	if (response && !response.error && Array.isArray(response.result)) {
		count = response.result.length;
		titles = response.result
			.slice(0, 3)
			.map((x: any) => x?.title ?? "")
			.filter((title: string) => title.length > 0);
	}
	return { fatal: false, lines: [`codeAction: count=${count} titles=${JSON.stringify(titles)}`] };
}
