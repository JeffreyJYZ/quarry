import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Preferences, ProjectSettings } from "@/settings/model";

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

/**
 * Scaffolds a new project directory and returns it already inspected.
 *
 * `kind` is one of `rust-bin`, `rust-lib` or `cpp-cmake`; the backend rejects anything else, a
 * relative parent, a name that is not a single path segment and a target that already exists.
 */
export function createProject(parent: string, name: string, kind: string): Promise<ProjectInfo> {
	return invoke<ProjectInfo>("create_project", { parent, name, kind });
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
	/** Executable the build reported, absent for libraries and text-only builds. */
	artifact?: string | null;
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
	caseSensitive?: boolean,
	fixedStrings?: boolean,
): Promise<SearchReport> {
	return invoke<SearchReport>("search_project", {
		root,
		query,
		maxResults: maxResults ?? null,
		caseSensitive: caseSensitive ?? null,
		fixedStrings: fixedStrings ?? null,
	});
}

export type ReplaceReport = {
	filesChanged: number;
	replacements: number;
	errors: string[];
};

export function replaceProject(
	root: string,
	query: string,
	replacement: string,
	caseSensitive?: boolean,
	fixedStrings?: boolean,
): Promise<{
	files_changed: number;
	replacements: number;
	errors: string[];
}> {
	return invoke("replace_project", {
		root,
		query,
		replacement,
		caseSensitive: caseSensitive ?? null,
		fixedStrings: fixedStrings ?? null,
	});
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
	railCollapsed?: boolean;
	debugOpen?: boolean;
	gitOpen?: boolean;
	dockTab?: "tests" | "problems" | "refs" | "run";
	dockExpanded?: boolean | null;
	recentRoots?: string[];
	recentFiles?: string[];
	runConfigurations?: RunConfiguration[];
	/** User-wide preferences; absent in a file written before the settings page existed. */
	preferences?: Preferences;
};

/**
 * One saved run panel: a snapshot of the form, never a hidden override.
 *
 * `args` is the args field verbatim so the run path splits it with the same quote-aware `splitArgs`
 * the form uses; `env` keeps the form's row order as `[name, value]` pairs.
 */
export type RunConfiguration = {
	name: string;
	program: string;
	args: string;
	cwd: string;
	env: [string, string][];
};

export function readSettings(): Promise<Settings> {
	return invoke<Settings>("read_settings");
}

export function writeSettings(settings: Settings): Promise<void> {
	return invoke<void>("write_settings", { settings });
}

/**
 * Settings as they go back to disk: what the file already held first, this build's values on top.
 *
 * `readSettings` returns fields this build does not know because the Rust side flattens them into
 * its `extra` map, so spreading the value it returned keeps a newer build's settings intact instead
 * of dropping them on our next save.
 */
export function settingsForWrite(preserved: Record<string, unknown>, known: Settings): Settings {
	return { ...preserved, ...known };
}

export function rememberRoot(root: string): Promise<string[]> {
	return invoke<string[]>("remember_root", { root });
}

/** Per-project overrides from `<root>/.quarry/settings.json`; defaults when the file is absent. */
export function readProjectSettings(root: string): Promise<ProjectSettings> {
	return invoke<ProjectSettings>("read_project_settings", { root });
}

export function writeProjectSettings(root: string, settings: ProjectSettings): Promise<void> {
	return invoke<void>("write_project_settings", { root, settings });
}

export type BreakpointSpec = {
	line: number;
	condition?: string | null;
	hitCondition?: string | null;
	logMessage?: string | null;
	enabled?: boolean;
};

export function dapAttach(pid: number): Promise<DapSession> {
	return invoke<DapSession>("dap_attach", { pid });
}

export function dapSetBreakpointsEx(
	session: string,
	path: string,
	breakpoints: BreakpointSpec[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_breakpoints_ex", { session, path, breakpoints });
}

export type GitStatusEntry = {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";
	staged: boolean;
};

export type GitStatus = {
	branch: string | null;
	entries: GitStatusEntry[];
	ahead: number;
	behind: number;
};

export type GitFileDiff = { path: string; diff: string; binary: boolean };

export function gitStatus(root: string): Promise<GitStatus> {
	return invoke<GitStatus>("git_status", { root });
}

export function gitFileDiff(root: string, path: string): Promise<GitFileDiff> {
	return invoke<GitFileDiff>("git_file_diff", { root, path });
}

export type RunOutputEvent = { runId: string; stream: "stdout" | "stderr"; line: string };
export type RunExitedEvent = { runId: string; code: number | null };

export type EnvVar = { name: string; value: string };

export function runProgram(
	program: string,
	args: string[],
	cwd: string,
	env?: EnvVar[],
): Promise<string> {
	return invoke<string>("run_program", { program, args, cwd, env: env ?? null });
}

export function stopProgram(runId: string): Promise<void> {
	return invoke<void>("stop_program", { runId });
}

export function onRunOutput(handler: (event: RunOutputEvent) => void): Promise<() => void> {
	return listen<RunOutputEvent>("run://output", (event) => handler(event.payload));
}

export function onRunExited(handler: (event: RunExitedEvent) => void): Promise<() => void> {
	return listen<RunExitedEvent>("run://exited", (event) => handler(event.payload));
}

export type Symbol = { name: string; kind: number; range: Range; depth: number };

export type WorkspaceSymbol = {
	name: string;
	kind: number;
	container: string;
	path: string;
	line: number;
	character: number;
};

export function lspSymbols(root: string, path: string): Promise<Symbol[]> {
	return invoke<Symbol[]>("lsp_symbols", { root, path });
}

/** Project-wide symbol search, the backend for go-to-class. */
export function lspWorkspaceSymbols(root: string, query: string): Promise<WorkspaceSymbol[]> {
	return invoke<WorkspaceSymbol[]>("lsp_workspace_symbols", { root, query });
}

export type TextEdit = { range: Range; newText: string };
export type FileEdit = { path: string; edits: TextEdit[] };
export type CodeAction = { title: string; kind: string | null; edits: FileEdit[] };

export function lspRename(
	root: string,
	path: string,
	line: number,
	character: number,
	newName: string,
): Promise<FileEdit[]> {
	return invoke<FileEdit[]>("lsp_rename", { root, path, line, character, newName });
}

export function lspCodeActions(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CodeAction[]> {
	return invoke<CodeAction[]>("lsp_code_actions", { root, path, line, character });
}

export function dapWriteMemory(session: string, address: string, bytes: number[]): Promise<void> {
	return invoke<void>("dap_write_memory", { session, address, bytes });
}

export function dapSetVariable(
	session: string,
	variablesReference: number,
	name: string,
	value: string,
): Promise<void> {
	return invoke<void>("dap_set_variable", { session, variablesReference, name, value });
}

export type PtyOutputEvent = { id: string; data: string };
export type PtyExitedEvent = { id: string; code: number | null };

export type PtyOpenResult = { id: string; pid: number | null };
export function ptyOpen(cwd: string, rows: number, cols: number): Promise<PtyOpenResult> {
	return invoke<PtyOpenResult>("pty_open", { cwd, rows, cols });
}

export function ptyWrite(id: string, data: string): Promise<void> {
	return invoke<void>("pty_write", { id, data });
}

export function ptyResize(id: string, rows: number, cols: number): Promise<void> {
	return invoke<void>("pty_resize", { id, rows, cols });
}

export function ptyClose(id: string): Promise<void> {
	return invoke<void>("pty_close", { id });
}

export function onPtyOutput(handler: (event: PtyOutputEvent) => void): Promise<() => void> {
	return listen<PtyOutputEvent>("pty://output", (event) => handler(event.payload));
}

export function onPtyExited(handler: (event: PtyExitedEvent) => void): Promise<() => void> {
	return listen<PtyExitedEvent>("pty://exited", (event) => handler(event.payload));
}

export type SignatureInformation = { label: string; documentation: string | null };
export type SignatureHelp = {
	signatures: SignatureInformation[];
	activeSignature: number;
	activeParameter: number;
};

export function lspSignatureHelp(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<SignatureHelp | null> {
	return invoke<SignatureHelp | null>("lsp_signature_help", { root, path, line, character });
}

export type InlayHint = { line: number; character: number; label: string; kind: number | null };

export function lspInlayHints(root: string, path: string): Promise<InlayHint[]> {
	return invoke<InlayHint[]>("lsp_inlay_hints", { root, path });
}

export function dapRestart(session: string): Promise<DapSession> {
	return invoke<DapSession>("dap_restart", { session });
}

export function gitStage(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_stage", { root, paths });
}

export function gitUnstage(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_unstage", { root, paths });
}

export type CallHierarchyNode = {
	name: string;
	kind: number;
	path: string;
	line: number;
	character: number;
	itemId: number;
};

export function lspCallHierarchyPrepare(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<CallHierarchyNode[]> {
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
	return invoke<CallHierarchyNode[]>("lsp_call_hierarchy_calls", { root, itemId, direction });
}

export function gitCommit(root: string, message: string): Promise<string> {
	return invoke<string>("git_commit", { root, message });
}

export type ProcessInfo = { pid: number; name: string };

export function listProcesses(): Promise<ProcessInfo[]> {
	return invoke<ProcessInfo[]>("list_processes");
}

export function lspDocumentHighlights(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<Range[]> {
	return invoke<Range[]>("lsp_document_highlights", { root, path, line, character });
}

export type Branch = { name: string; current: boolean };

export function gitBranches(root: string): Promise<Branch[]> {
	return invoke<Branch[]>("git_branches", { root });
}

export function gitCheckout(root: string, branch: string): Promise<void> {
	return invoke<void>("git_checkout", { root, branch });
}

export type GitCommitEntry = { hash: string; subject: string; author: string; when: string };

export function gitLog(root: string, limit?: number): Promise<GitCommitEntry[]> {
	return invoke<GitCommitEntry[]>("git_log", { root, limit: limit ?? null });
}

export type CommitDiff = { hash: string; diff: string; binary: boolean };

export function gitCommitDiff(root: string, hash: string): Promise<CommitDiff> {
	return invoke<CommitDiff>("git_commit_diff", { root, hash });
}

export function listFiles(root: string): Promise<string[]> {
	return invoke<string[]>("list_files", { root });
}

export type BlameLine = { line: number; hash: string; author: string; subject: string };

export function gitBlame(root: string, path: string): Promise<BlameLine[]> {
	return invoke<BlameLine[]>("git_blame", { root, path });
}

export type ExceptionFilter = { filter: string; label: string; default: boolean };

export function dapExceptionFilters(session: string): Promise<ExceptionFilter[]> {
	return invoke<ExceptionFilter[]>("dap_exception_filters", { session });
}

export function dapSetExceptionBreakpoints(session: string, filters: string[]): Promise<void> {
	return invoke<void>("dap_set_exception_breakpoints", { session, filters });
}

export function gitDiscard(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_discard", { root, paths });
}

export function gitAmend(root: string, message: string): Promise<string> {
	return invoke<string>("git_amend", { root, message });
}
