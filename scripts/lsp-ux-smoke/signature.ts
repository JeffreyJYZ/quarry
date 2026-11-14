/**
 * Signature help, asked twice: the first time at the identifier inside a call (a failure there is
 * fatal, because a refused request is not data), the second time as a shape reading.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

/** Position inside the call expression in `main.rs`. */
const CALL_POSITION = { line: 4, character: 20 };

export async function probeSignature(client: LspClient, uri: string): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/signatureHelp",
		{ textDocument: { uri }, position: CALL_POSITION },
		REQ_TIMEOUT,
	);
	let label = "none";
	let ok = false;
	if (response && !response.error && response.result != null) {
		const result = response.result;
		const signatures = Array.isArray(result?.signatures) ? result.signatures : [];
		const active = typeof result?.activeSignature === "number" ? result.activeSignature : 0;
		if (signatures.length > 0) {
			const pick = signatures[active] ?? signatures[0];
			label = pick?.label ?? "none";
			ok = true;
		}
	}
	if (response?.error) {
		return {
			fatal: true,
			lines: [`signatureHelp: FAIL ERR ${JSON.stringify(response.error)}`],
		};
	}
	return { fatal: false, lines: [`signatureHelp: ${ok ? "OK" : "none"} label=${label}`] };
}

/** The same request again, reported with the shape verdict the dock's parser needs. */
export async function probeSignatureShape(client: LspClient, uri: string): Promise<ProbeResult> {
	const response = await client.ask(
		"textDocument/signatureHelp",
		{ textDocument: { uri }, position: CALL_POSITION },
		REQ_TIMEOUT,
	);
	let label = "none";
	let ok = false;
	let shapeOk = false;
	if (response && !response.error) {
		const result = response.result;
		if (result === null) {
			shapeOk = true;
		} else if (result && Array.isArray(result.signatures)) {
			shapeOk = true;
			const signatures = result.signatures;
			const active = typeof result.activeSignature === "number" ? result.activeSignature : 0;
			if (signatures.length > 0) {
				const pick = signatures[active] ?? signatures[0];
				label = pick?.label ?? "none";
				ok = true;
			}
		}
	}
	if (!response || response.error) {
		return {
			fatal: true,
			lines: [
				`signatureHelp: FAIL ${response?.error ? JSON.stringify(response.error) : "no response"}`,
			],
		};
	}
	return {
		fatal: false,
		lines: [`signatureHelp: ${ok ? "OK" : "none"} label=${label} shape_ok=${shapeOk}`],
	};
}
