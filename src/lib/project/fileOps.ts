import { invoke } from "@tauri-apps/api/core";

export function createFile(root: string, parent: string, name: string): Promise<string> {
	return invoke<string>("create_file", { root, parent, name });
}

export function createDir(root: string, parent: string, name: string): Promise<string> {
	return invoke<string>("create_dir", { root, parent, name });
}

export function renamePath(root: string, oldPath: string, newName: string): Promise<string> {
	return invoke<string>("rename_path", { root, oldPath, newName });
}

export function deletePath(root: string, path: string): Promise<void> {
	return invoke<void>("delete_path", { root, path });
}
