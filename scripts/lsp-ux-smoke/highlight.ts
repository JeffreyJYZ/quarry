/**
 * Document highlight: every occurrence of the identifier under the caret, each with a range.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeHighlight(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/documentHighlight",
		{ textDocument: { uri }, position },
		REQ_TIMEOUT,
	);
	let count = 0;
	let hasRange = false;
	let shapeOk = false;
	if (response && !response.error) {
		const result = response.result;
		if (result === null) {
			shapeOk = true;
		} else if (Array.isArray(result)) {
			count = result.length;
			shapeOk = true;
			if (result.length > 0) {
				const entry = result[0];
				const start = entry?.range?.start;
				const end = entry?.range?.end;
				hasRange =
					typeof start?.line === "number" &&
					typeof start?.character === "number" &&
					typeof end?.line === "number" &&
					typeof end?.character === "number";
			}
		} else {
			shapeOk = false;
		}
	}
	if (!response || response.error) {
		return {
			fatal: true,
			lines: [
				`documentHighlight: FAIL ${response?.error ? JSON.stringify(response.error) : "no response"}`,
			],
		};
	}
	return {
		fatal: false,
		lines: [`documentHighlight: count=${count} firstHasRange=${hasRange} shape_ok=${shapeOk}`],
	};
}
