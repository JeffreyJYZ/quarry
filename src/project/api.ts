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

export type LaunchConfig = {
	program: string;
	args: string[];
	cwd: string;
	stopOnEntry: boolean;
	initCommands: string[];
};

export type LaunchPreset = {
	name: string;
	program: string | null;
	args: string[];
	cwd: string | null;
	build: string | null;
	stopOnEntry: boolean;
	initCommands: string[];
};

export type LaunchFile = { configurations: LaunchPreset[] };

export type DapSession = { id: string; program: string };
export type DapThread = { id: number; name: string };
export type DapFrame = {
	id: number;
	name: string;
	source: string | null;
	line: number;
	column: number;
	instructionPointer: string | null;
};
export type DapScope = { name: string; variablesReference: number; expensive: boolean };
export type DapVariable = {
	name: string;
	value: string;
	typeName: string | null;
	variablesReference: number;
	memoryReference: string | null;
};
export type DapBreakpoint = {
	id: number | null;
	verified: boolean;
	line: number | null;
	message: string | null;
	source: string | null;
};
export type MemoryDump = { address: string; bytes: number[] };
export type DisassembledInstruction = {
	address: string;
	instruction: string;
	symbol: string | null;
};
export type DataBreakpointInfo = {
	dataId: string | null;
	description: string;
	accessTypes: string[];
};
export type DapStoppedEvent = {
	session: string;
	reason: string;
	description: string | null;
	threadId: number | null;
	line: number | null;
	source: string | null;
};

export function readLaunchConfig(root: string): Promise<LaunchFile> {
	return invoke<LaunchFile>("read_launch_config", { root });
}

export function writeLaunchConfig(root: string, file: LaunchFile): Promise<string> {
	return invoke<string>("write_launch_config", { root, file });
}

export function resolveLaunchConfig(root: string, name: string): Promise<LaunchConfig> {
	return invoke<LaunchConfig>("resolve_launch_config", { root, name });
}

export function dapLaunch(root: string, config: LaunchConfig): Promise<DapSession> {
	return invoke<DapSession>("dap_launch", { root, config });
}

export function dapConfigurationDone(session: string): Promise<void> {
	return invoke<void>("dap_configuration_done", { session });
}

export function dapSetBreakpoints(
	session: string,
	path: string,
	lines: number[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_breakpoints", { session, path, lines });
}

export function dapContinue(session: string): Promise<void> {
	return invoke<void>("dap_continue", { session });
}

export function dapStep(session: string, kind: "next" | "stepIn" | "stepOut"): Promise<void> {
	return invoke<void>("dap_step", { session, kind });
}

export function dapThreads(session: string): Promise<DapThread[]> {
	return invoke<DapThread[]>("dap_threads", { session });
}

export function dapStackTrace(session: string, threadId: number): Promise<DapFrame[]> {
	return invoke<DapFrame[]>("dap_stack_trace", { session, threadId });
}

export function dapScopes(session: string, frameId: number): Promise<DapScope[]> {
	return invoke<DapScope[]>("dap_scopes", { session, frameId });
}

export function dapVariables(session: string, variablesReference: number): Promise<DapVariable[]> {
	return invoke<DapVariable[]>("dap_variables", { session, variablesReference });
}

export function dapReadMemory(
	session: string,
	address: string,
	count: number,
): Promise<MemoryDump> {
	return invoke<MemoryDump>("dap_read_memory", { session, address, count });
}

export function dapDisassemble(
	session: string,
	address: string,
	count: number,
): Promise<DisassembledInstruction[]> {
	return invoke<DisassembledInstruction[]>("dap_disassemble", { session, address, count });
}

export function dapDataBreakpointInfo(
	session: string,
	variablesReference: number,
	name: string,
): Promise<DataBreakpointInfo> {
	return invoke<DataBreakpointInfo>("dap_data_breakpoint_info", {
		session,
		variablesReference,
		name,
	});
}

export function dapSetDataBreakpoints(
	session: string,
	dataIds: string[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_data_breakpoints", { session, dataIds });
}

export function dapStop(session: string): Promise<void> {
	return invoke<void>("dap_stop", { session });
}

export function onDapStopped(handler: (event: DapStoppedEvent) => void): Promise<() => void> {
	return listen<DapStoppedEvent>("dap://stopped", (event) => handler(event.payload));
}

export function onDapTerminated(handler: (session: string) => void): Promise<() => void> {
	return listen<{ session: string }>("dap://terminated", (event) =>
		handler(event.payload.session),
	);
}

export type TestItem = { name: string; binary: string };
export type TestReport = { name: string; passed: boolean; output: string; durationMs: number };

export function writeTextFile(path: string, text: string): Promise<void> {
	return invoke<void>("write_text_file", { path, text });
}

export function formatDocument(root: string, path: string, text: string): Promise<string> {
	return invoke<string>("format_document", { root, path, text });
}

export function formatterFor(path: string): Promise<string> {
	return invoke<string>("formatter_for", { path });
}

export function defaultLaunchConfig(root: string, stopOnEntry: boolean): Promise<LaunchConfig> {
	return invoke<LaunchConfig>("default_launch_config", { root, stopOnEntry });
}

export function listTests(root: string): Promise<TestItem[]> {
	return invoke<TestItem[]>("list_tests", { root });
}

export function runTest(root: string, name: string): Promise<TestReport> {
	return invoke<TestReport>("run_test", { root, name });
}

export type Location = { path: string; range: Range };
export type HoverInfo = { contents: string; range: Range | null };
export type CompletionItem = {
	label: string;
	detail: string | null;
	kind: number | null;
	insertText: string | null;
};
export type CompletionList = { items: CompletionItem[]; isIncomplete: boolean };

export function lspHover(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<HoverInfo | null> {
	return invoke<HoverInfo | null>("lsp_hover", { root, path, line, character });
}

export function lspDefinition(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	return invoke<Location[]>("lsp_definition", { root, path, line, character });
}

export function lspReferences(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Location[]> {
	return invoke<Location[]>("lsp_references", { root, path, line, character });
}

export function lspCompletion(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CompletionList> {
	return invoke<CompletionList>("lsp_completion", { root, path, line, character });
}

export type Settings = {
	lastRoot: string | null;
	openFiles: string[];
	activeFile: string | null;
};

export function readSettings(): Promise<Settings> {
	return invoke<Settings>("read_settings");
}

export function writeSettings(settings: Settings): Promise<void> {
	return invoke<void>("write_settings", { settings });
}
