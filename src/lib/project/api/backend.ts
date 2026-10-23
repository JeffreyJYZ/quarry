import { invoke } from "@tauri-apps/api/core";

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

export type BuildReport = {
	success: boolean;
	diagnostics: import("@/lib/project/api/lsp-types").Diagnostic[];
	durationMs: number;
	summary: string;
	/** Executable the build reported, absent for libraries and text-only builds. */
	artifact?: string | null;
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
 * `kind` is one of `rust-bin`, `rust-lib`, `c-cmake` or `cpp-cmake`; `standard` is the language
 * standard for that kind (empty means its default). The backend rejects anything else, a relative
 * parent, a name that is not a single path segment and a target that already exists.
 */
export function createProject(
	parent: string,
	name: string,
	kind: string,
	standard: string,
): Promise<ProjectInfo> {
	return invoke<ProjectInfo>("create_project", { parent, name, kind, standard });
}

export function listDir(path: string): Promise<FileEntry[]> {
	return invoke<FileEntry[]>("list_dir", { path });
}

export function readTextFile(path: string): Promise<string> {
	return invoke<string>("read_text_file", { path });
}

export function writeTextFile(path: string, text: string): Promise<void> {
	return invoke<void>("write_text_file", { path, text });
}

export function listFiles(root: string): Promise<string[]> {
	return invoke<string[]>("list_files", { root });
}

export function version(): Promise<string> {
	return invoke<string>("version");
}

export function formatDocument(root: string, path: string, text: string): Promise<string> {
	return invoke<string>("format_document", { root, path, text });
}

export function formatterFor(path: string): Promise<string> {
	return invoke<string>("formatter_for", { path });
}

export function buildProject(root: string, profile: "debug" | "release"): Promise<BuildReport> {
	return invoke<BuildReport>("build_project", { root, profile });
}
