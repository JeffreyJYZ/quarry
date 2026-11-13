import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DiagnosticsEvent, LspStatus, SessionEndedEvent } from "@/lib/project/api/lsp-types";

export function startLsp(
	root: string,
	serverPath = "",
	serverArgs: string[] = [],
	profile = "",
): Promise<LspStatus> {
	return invoke<LspStatus>("start_lsp", {
		root,
		serverPath: serverPath === "" ? null : serverPath,
		serverArgs: serverArgs.length === 0 ? null : serverArgs,
		// The build profile the window has in effect, so the hand-off configures the tree the build
		// would and clangd analyses the flags the user compiled with.
		profile: profile === "" ? null : profile,
	});
}

export function stopLsp(root: string): Promise<void> {
	return invoke<void>("stop_lsp", { root });
}

/** Opens a document and answers the version the server assigned it. */
export function lspOpenDocument(root: string, path: string, text: string): Promise<number> {
	return invoke<number>("lsp_open_document", { root, path, text });
}

/** Sends new text and answers the version the server assigned it; unchanged text keeps the old one. */
export function lspChangeDocument(root: string, path: string, text: string): Promise<number> {
	return invoke<number>("lsp_change_document", { root, path, text });
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

/** A server that stopped, so its findings describe a program nothing analyses any more. */
export async function onSessionEnded(
	handler: (event: SessionEndedEvent) => void,
): Promise<() => void> {
	const unlisten = await listen<SessionEndedEvent>("lsp://session-ended", (event) => {
		handler(event.payload);
	});
	return unlisten;
}
