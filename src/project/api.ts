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

export function toolchains(): Promise<ToolchainReport> {
	return invoke<ToolchainReport>("toolchains");
}

export function openProject(root: string): Promise<ProjectInfo> {
	return invoke<ProjectInfo>("open_project", { root });
}

export function listDir(path: string): Promise<FileEntry[]> {
	return invoke<FileEntry[]>("list_dir", { path });
}

export function version(): Promise<string> {
	return invoke<string>("version");
}
