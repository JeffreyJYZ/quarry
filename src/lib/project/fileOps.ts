import { invoke } from "@tauri-apps/api/core";
import { invalidateFileList } from "@/lib/quickopen/files";

/**
 * Every mutation forgets quick open's file index: a cached list would hide the new file or keep
 * offering the deleted one for the rest of its window.
 */
export async function createFile(root: string, parent: string, name: string): Promise<string> {
	const path = await invoke<string>("create_file", { root, parent, name });
	invalidateFileList(root);
	return path;
}

export async function createDir(root: string, parent: string, name: string): Promise<string> {
	const path = await invoke<string>("create_dir", { root, parent, name });
	invalidateFileList(root);
	return path;
}

export async function renamePath(root: string, oldPath: string, newName: string): Promise<string> {
	const path = await invoke<string>("rename_path", { root, oldPath, newName });
	invalidateFileList(root);
	return path;
}

export async function deletePath(root: string, path: string): Promise<void> {
	await invoke<void>("delete_path", { root, path });
	invalidateFileList(root);
}
