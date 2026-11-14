/**
 * Hover, polled until the server answers with a result.
 *
 * A cold rust-analyzer answers `null` for a while before it has indexed, so a single request is a
 * false failure; the poll is what makes this probe mean "the feature works", not "the server was
 * warm".
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { INDEX_TIMEOUT, type ProbeResult } from "./requests";

export async function probeHover(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	let hoverResp: any = null;
	const deadline = Date.now() + INDEX_TIMEOUT;
	while (Date.now() < deadline) {
		const response = await client.ask(
			"textDocument/hover",
			{ textDocument: { uri }, position },
			5000,
		);
		if (response && response.result != null) {
			hoverResp = response;
			break;
		}
		if (response) hoverResp = response;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	const hoverOk = !!hoverResp && hoverResp.result != null && !hoverResp.error;
	const lines = [`hover: ${hoverOk ? "OK" : "FAIL"}`];
	if (!hoverOk && hoverResp)
		lines.push(`  hover raw: ${JSON.stringify(hoverResp).slice(0, 500)}`);
	return { fatal: !hoverOk, lines };
}
