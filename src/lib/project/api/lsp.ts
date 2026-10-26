import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	CallHierarchyNode,
	CodeAction,
	CompletionList,
	DiagnosticsEvent,
	FileEdit,
	HoverInfo,
	InlayHint,
	Location,
	LspStatus,
	Range,
	SignatureHelp,
	DocumentSymbol,
	WorkspaceSymbol,
} from "@/lib/project/api/lsp-types";

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

function requireSessionId(wrapper: string, root: string): void {
	if (import.meta.env.DEV && !root.includes("::")) {
		throw new Error(`${wrapper} expects a session id, got a path`);
	}
}

export function lspHover(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<HoverInfo | null> {
	requireSessionId("lsp_hover", root);
	return invoke<HoverInfo | null>("lsp_hover", { root, path, line, character });
}

export function lspDefinition(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	requireSessionId("lsp_definition", root);
	return invoke<Location[]>("lsp_definition", { root, path, line, character });
}

export function lspReferences(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	requireSessionId("lsp_references", root);
	return invoke<Location[]>("lsp_references", { root, path, line, character });
}

export function lspCompletion(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CompletionList> {
	requireSessionId("lsp_completion", root);
	return invoke<CompletionList>("lsp_completion", { root, path, line, character });
}

export function lspSymbols(root: string, path: string): Promise<DocumentSymbol[]> {
	requireSessionId("lsp_symbols", root);
	return invoke<DocumentSymbol[]>("lsp_symbols", { root, path });
}

/** Project-wide symbol search, the backend for go-to-class. */
export function lspWorkspaceSymbols(root: string, query: string): Promise<WorkspaceSymbol[]> {
	requireSessionId("lsp_workspace_symbols", root);
	return invoke<WorkspaceSymbol[]>("lsp_workspace_symbols", { root, query });
}

export function lspRename(
	root: string,
	path: string,
	line: number,
	character: number,
	newName: string,
): Promise<FileEdit[]> {
	requireSessionId("lsp_rename", root);
	return invoke<FileEdit[]>("lsp_rename", { root, path, line, character, newName });
}

export function lspCodeActions(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CodeAction[]> {
	requireSessionId("lsp_code_actions", root);
	return invoke<CodeAction[]>("lsp_code_actions", { root, path, line, character });
}

export function lspSignatureHelp(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<SignatureHelp | null> {
	requireSessionId("lsp_signature_help", root);
	return invoke<SignatureHelp | null>("lsp_signature_help", { root, path, line, character });
}

export function lspInlayHints(root: string, path: string): Promise<InlayHint[]> {
	requireSessionId("lsp_inlay_hints", root);
	return invoke<InlayHint[]>("lsp_inlay_hints", { root, path });
}

export function lspDocumentHighlights(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Range[]> {
	requireSessionId("lsp_document_highlights", root);
	return invoke<Range[]>("lsp_document_highlights", { root, path, line, character });
}

export function lspCallHierarchyPrepare(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CallHierarchyNode[]> {
	requireSessionId("lsp_call_hierarchy_prepare", root);
	return invoke<CallHierarchyNode[]>("lsp_call_hierarchy_prepare", {
		root,
		path,
		line,
		character,
	});
}

export function lspCallHierarchyCalls(
	root: string,
	itemId: number,
	direction: "incoming" | "outgoing",
): Promise<CallHierarchyNode[]> {
	requireSessionId("lsp_call_hierarchy_calls", root);
	return invoke<CallHierarchyNode[]>("lsp_call_hierarchy_calls", { root, itemId, direction });
}
