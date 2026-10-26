import { invoke } from "@tauri-apps/api/core";
import type {
	CallHierarchyNode,
	CodeAction,
	CompletionList,
	FileEdit,
	HoverInfo,
	InlayHint,
	Location,
	Range,
	SignatureHelp,
	DocumentSymbol,
	WorkspaceSymbol,
} from "@/lib/project/api/lsp-types";

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

export function lspImplementation(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	requireSessionId("lsp_implementation", root);
	return invoke<Location[]>("lsp_implementation", { root, path, line, character });
}

export function lspTypeDefinition(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	requireSessionId("lsp_type_definition", root);
	return invoke<Location[]>("lsp_type_definition", { root, path, line, character });
}

export function lspExecuteCommand(
	root: string,
	command: string,
	args: unknown[] = [],
): Promise<unknown> {
	requireSessionId("lsp_execute_command", root);
	return invoke<unknown>("lsp_execute_command", { root, command, args });
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
