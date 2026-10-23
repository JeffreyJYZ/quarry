import { invoke } from "@tauri-apps/api/core";

export function gitStageHunk(root: string, path: string, hunkId: string): Promise<void> {
	return invoke<void>("git_stage_hunk", { root, path, hunkId });
}

export function gitUnstageHunk(root: string, path: string, hunkId: string): Promise<void> {
	return invoke<void>("git_unstage_hunk", { root, path, hunkId });
}
