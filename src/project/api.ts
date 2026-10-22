import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ToolSource = "path" | "xcrun" | "missing";

export type ToolInfo = {
	name: string;
	path: string | null;
	source: ToolSource;
};

export type ToolchainReport = {
	tools: ToolInfo[];
};

export type ProjectKind = "cargo" | "cmake" | "compileCommands" | "unknown";

export type ProjectInfo = {
	root: string;
	name: string;
	kind: ProjectKind;
	buildRoot: string;
	launchConfig: string | null;
};

export type FileEntry = {
	name: string;
	path: string;
	isDir: boolean;
};

export function toolchains(): Promise<ToolchainReport> {
	return invoke<ToolchainReport>("toolchains");
}

export function openProject(root: string): Promise<ProjectInfo> {
	return invoke<ProjectInfo>("open_project", { root });
}

export function listDir(path: string): Promise<FileEntry[]> {
	return invoke<FileEntry[]>("list_dir", { path });
}

export function readTextFile(path: string): Promise<string> {
	return invoke<string>("read_text_file", { path });
}

export function version(): Promise<string> {
	return invoke<string>("version");
}

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

export type LspStatus = {
	root: string;
	server: string;
	version: string | null;
};

export type BuildReport = {
	success: boolean;
	diagnostics: Diagnostic[];
	durationMs: number;
	summary: string;
};

export function startLsp(root: string): Promise<LspStatus> {
	return invoke<LspStatus>("start_lsp", { root });
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

export function buildProject(root: string, profile: "debug" | "release"): Promise<BuildReport> {
	return invoke<BuildReport>("build_project", { root, profile });
}

export type SearchMatch = {
	path: string;
	/** 1-based. */
	line: number;
	/** 1-based byte column. */
	column: number;
	text: string;
};

export type SearchReport = {
	matches: SearchMatch[];
	truncated: boolean;
	durationMs: number;
};

export function searchProject(
	root: string,
	query: string,
	maxResults?: number,
): Promise<SearchReport> {
	return invoke<SearchReport>("search_project", { root, query, maxResults: maxResults ?? null });
}

export async function onDiagnostics(
	handler: (event: DiagnosticsEvent) => void,
): Promise<() => void> {
	const unlisten = await listen<DiagnosticsEvent>("lsp://diagnostics", (event) => {
		handler(event.payload);
	});
	return unlisten;
}
