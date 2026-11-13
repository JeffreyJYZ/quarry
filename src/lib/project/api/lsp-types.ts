/** Shapes shared by the language-server half of the backend. */

export type Position = { line: number; character: number };
export type Range = { start: Position; end: Position };

export type Diagnostic = {
	path: string;
	range: Range;
	/** 1 error, 2 warning, 3 information, 4 hint. */
	severity: 1 | 2 | 3 | 4;
	message: string;
	source: string | null;
};

export type DiagnosticsEvent = {
	root: string;
	path: string;
	diagnostics: Diagnostic[];
};

/** Payload of the `lsp://session-ended` event: one server's reader thread has finished. */
export type SessionEndedEvent = {
	root: string;
	/** `rust-analyzer` or `clangd`. */
	server: string;
};

export type LspStatus = {
	root: string;
	server: string;
	version: string | null;
	/**
	 * Why the start had to configure the project's tree, when it did — a profile change is a genuine
	 * reconfigure of the user's build directory, so the window says so once.
	 */
	note?: string | null;
};

export type Location = { path: string; range: Range };
export type HoverInfo = { contents: string; range: Range | null };

export type CompletionItem = {
	label: string;
	detail: string | null;
	kind: number | null;
	insertText: string | null;
};

export type CompletionList = { items: CompletionItem[]; isIncomplete: boolean };

export type DocumentSymbol = { name: string; kind: number; range: Range; depth: number };

export type WorkspaceSymbol = {
	name: string;
	kind: number;
	container: string;
	path: string;
	line: number;
	character: number;
};

export type TextEdit = { range: Range; newText: string };
export type FileEdit = {
	path: string;
	edits: TextEdit[];
	/** Document version the server computed these edits against, when it declared one. */
	version?: number | null;
};
export type CodeAction = {
	title: string;
	kind: string | null;
	edits: FileEdit[];
	command?: string;
};

export type SignatureInformation = { label: string; documentation: string | null };
export type SignatureHelp = {
	signatures: SignatureInformation[];
	activeSignature: number;
	activeParameter: number;
};

export type InlayHint = { line: number; character: number; label: string; kind: number | null };

export type CallHierarchyNode = {
	name: string;
	kind: number;
	path: string;
	line: number;
	character: number;
	itemId: number;
};
