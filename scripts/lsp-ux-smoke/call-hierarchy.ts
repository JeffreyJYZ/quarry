/**
 * Call hierarchy: prepare, then incoming and outgoing calls on the item prepare returned.
 *
 * Both calls need that item, so they are skipped — and said to be skipped — when prepare yields
 * nothing rather than asked with a missing argument. A refused incoming call does not stop the
 * outgoing one: each direction is its own reading.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: LSP payloads are untyped JSON
import type { LspClient } from "../lsp-client";
import { type ProbeResult, REQ_TIMEOUT } from "./requests";

export async function probeCallHierarchy(
	client: LspClient,
	uri: string,
	position: { line: number; character: number },
): Promise<ProbeResult> {
	const lines: string[] = [];
	let fatal = false;

	const prepare = await client.ask(
		"textDocument/prepareCallHierarchy",
		{ textDocument: { uri }, position },
		REQ_TIMEOUT,
	);
	let count = 0;
	let name = "none";
	let kind = 0;
	let hasSelectionRange = false;
	let shapeOk = false;
	let firstItem: any = null;
	if (prepare && !prepare.error) {
		const result = prepare.result;
		if (Array.isArray(result)) {
			count = result.length;
			if (result.length > 0) {
				const item = result[0];
				firstItem = item;
				name = item?.name ?? "none";
				kind = typeof item?.kind === "number" ? item.kind : 0;
				hasSelectionRange = !!item?.selectionRange;
			}
			shapeOk = true;
		} else if (result === null) {
			shapeOk = true;
		}
	}
	if (!prepare || prepare.error) {
		fatal = true;
		lines.push(
			`callHierarchy prepare: FAIL ${prepare?.error ? JSON.stringify(prepare.error) : "no response"}`,
		);
	} else {
		lines.push(
			`callHierarchy prepare: count=${count} name=${name} kind=${kind} selectionRange=${hasSelectionRange} shape_ok=${shapeOk}`,
		);
	}

	if (!firstItem) {
		lines.push("callHierarchy incoming: skipped (no prepare item)");
		lines.push("callHierarchy outgoing: skipped (no prepare item)");
		return { fatal, lines };
	}

	const incoming = await client.ask(
		"callHierarchy/incomingCalls",
		{ item: firstItem },
		REQ_TIMEOUT,
	);
	if (!incoming || incoming.error) {
		fatal = true;
		lines.push(
			`callHierarchy incoming: FAIL ${incoming?.error ? JSON.stringify(incoming.error) : "no response"}`,
		);
	} else {
		lines.push(callLine("incoming", incoming.result, "from"));
	}

	const outgoing = await client.ask(
		"callHierarchy/outgoingCalls",
		{ item: firstItem },
		REQ_TIMEOUT,
	);
	if (!outgoing || outgoing.error) {
		fatal = true;
		lines.push(
			`callHierarchy outgoing: FAIL ${outgoing?.error ? JSON.stringify(outgoing.error) : "no response"}`,
		);
	} else {
		lines.push(callLine("outgoing", outgoing.result, "to"));
	}
	return { fatal, lines };
}

/** One direction's reading: a count and the keys of its first entry, which must carry `link`. */
function callLine(direction: string, result: unknown, link: "from" | "to"): string {
	let count = 0;
	let keys: string[] = [];
	let shapeOk = true;
	if (Array.isArray(result)) {
		count = result.length;
		if (result.length > 0) keys = Object.keys(result[0]).sort();
		if (result.length > 0) {
			const entry = result[0] as Record<string, any>;
			if (!entry?.[link] || typeof entry[link] !== "object") shapeOk = false;
		}
	} else if (result === null) {
		shapeOk = true;
	} else {
		shapeOk = false;
	}
	return `callHierarchy ${direction}: count=${count} keys=${JSON.stringify(keys)} shape_ok=${shapeOk}`;
}
