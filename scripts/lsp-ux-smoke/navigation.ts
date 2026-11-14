/**
 * Definition and references: both are data-bearing, so a count of zero is a reading rather than a
 * failure, and the shape the server chose is what the dock's parser must cope with.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeNavigation(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const lines: string[] = [];

	const defResp = await client.ask(
		"textDocument/definition",
		{ textDocument: { uri }, position },
		REQ_TIMEOUT,
	);
	let defShape = "none";
	let defCount = 0;
	let defExample: any = null;
	if (defResp && !defResp.error && defResp.result != null) {
		const result = defResp.result;
		if (Array.isArray(result)) {
			if (result.length && result[0].targetUri) defShape = "LocationLink[]";
			else defShape = "Location[]";
		} else if (result && (result.uri || result.targetUri)) {
			defShape = result.targetUri ? "LocationLink" : "Location";
		}
		defCount = Array.isArray(result) ? result.length : 1;
		defExample = Array.isArray(result) ? result[0] : result;
	}
	lines.push(
		`definition: shape=${defShape} count=${defCount} ${defResp?.error ? `ERR ${JSON.stringify(defResp.error)}` : ""}`,
	);

	const refResp = await client.ask(
		"textDocument/references",
		{
			textDocument: { uri },
			position,
			context: { includeDeclaration: true },
		},
		REQ_TIMEOUT,
	);
	let refCount = 0;
	if (refResp && !refResp.error && Array.isArray(refResp.result))
		refCount = refResp.result.length;
	lines.push(
		`references: count=${refCount} ${refResp?.error ? `ERR ${JSON.stringify(refResp.error)}` : ""}`,
	);

	// Handled shapes per lsp.rs: hover string | MarkupContent | MarkedString | array; definition
	// Location | Location[] | LocationLink[]; completion CompletionList or array; references an array
	// of Location. So the example is printed as a reading, not as an unhandled case.
	if (defExample) {
		lines.push(`definition example: ${JSON.stringify(defExample).slice(0, 600)}`);
	}
	return { fatal: false, lines };
}
