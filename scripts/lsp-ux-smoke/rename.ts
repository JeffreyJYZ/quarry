/**
 * Rename: the dock needs a workspace edit it can apply, in either of the two legal shapes.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeRename(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/rename",
		{
			textDocument: { uri },
			position,
			newName: "quarry_probe_rename",
		},
		REQ_TIMEOUT,
	);
	let shape = "none";
	let files = 0;
	let edits = 0;
	let ok = false;
	if (response && !response.error && response.result != null) {
		const result = response.result;
		if (result?.changes && typeof result.changes === "object") shape = "changes";
		else if (Array.isArray(result?.documentChanges)) shape = "documentChanges";
		if (shape === "changes") {
			files = Object.keys(result.changes).length;
			for (const key of Object.keys(result.changes)) {
				edits += Array.isArray(result.changes[key]) ? result.changes[key].length : 0;
			}
		} else if (shape === "documentChanges") {
			files = result.documentChanges.length;
			for (const change of result.documentChanges) {
				edits += Array.isArray(change?.edits) ? change.edits.length : 0;
			}
		}
		ok = shape !== "none";
	}
	if (response?.error || !ok) {
		return {
			fatal: true,
			lines: [
				`rename: FAIL ${response?.error ? JSON.stringify(response.error) : "no shape"}`,
			],
		};
	}
	return { fatal: false, lines: [`rename: shape=${shape} files=${files} edits=${edits}`] };
}
