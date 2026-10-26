import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DiagnosticsEvent, LspStatus } from "@/lib/project/api/lsp-types";

export function startLsp(
	root: string,
	serverPath = "",
	serverArgs: string[] = [],
): Promise<LspStatus> {
	return invoke<LspStatus>("start_lsp", {
		root,
		serverPath: serverPath === "" ? null : serverPath,
		serverArgs: serverArgs.length === 0 ? null : serverArgs,
	});
}

export function stopLsp(root: string): Promise<void> {
	return invoke<void>("stop_lsp", { root });
}

export function lspOpenDocument(root: string, path: string, text: string): Promise<void> {
	return invoke<void>("lsp_open_document", { root, path, text });
}

export function lspChangeDocument(root: string, path: string, text: string): Promise<void> {
	return invoke<void>("lsp_change_document", { root, path, text });
}

export function lspCloseDocument(root: string, path: string): Promise<void> {
	return invoke<void>("lsp_close_document", { root, path });
}

/** Tells the server a buffer was written, which is what triggers its checker. */
export function lspDidSave(root: string, path: string): Promise<void> {
	return invoke<void>("lsp_did_save", { root, path });
}

export async function onDiagnostics(
	handler: (event: DiagnosticsEvent) => void,
): Promise<() => void> {
	const unlisten = await listen<DiagnosticsEvent>("lsp://diagnostics", (event) => {
		handler(event.payload);
	});
	return unlisten;
}
