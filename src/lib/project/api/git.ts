import { invoke } from "@tauri-apps/api/core";

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
export type Branch = { name: string; current: boolean };
export type GitCommitEntry = { hash: string; subject: string; author: string; when: string };
export type CommitDiff = { hash: string; diff: string; binary: boolean };
export type BlameLine = { line: number; hash: string; author: string; subject: string };

export function gitStatus(root: string): Promise<GitStatus> {
	return invoke<GitStatus>("git_status", { root });
}

export function gitFileDiff(root: string, path: string): Promise<GitFileDiff> {
	return invoke<GitFileDiff>("git_file_diff", { root, path });
}

export function gitStage(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_stage", { root, paths });
}

export function gitUnstage(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_unstage", { root, paths });
}

export function gitDiscard(root: string, paths: string[]): Promise<void> {
	return invoke<void>("git_discard", { root, paths });
}

export function gitCommit(root: string, message: string): Promise<string> {
	return invoke<string>("git_commit", { root, message });
}

export function gitAmend(root: string, message: string): Promise<string> {
	return invoke<string>("git_amend", { root, message });
}

export function gitBranches(root: string): Promise<Branch[]> {
	return invoke<Branch[]>("git_branches", { root });
}

export function gitCheckout(root: string, branch: string): Promise<void> {
	return invoke<void>("git_checkout", { root, branch });
}

export function gitLog(root: string, limit?: number): Promise<GitCommitEntry[]> {
	return invoke<GitCommitEntry[]>("git_log", { root, limit: limit ?? null });
}

export function gitCommitDiff(root: string, hash: string): Promise<CommitDiff> {
	return invoke<CommitDiff>("git_commit_diff", { root, hash });
}

export function gitBlame(root: string, path: string): Promise<BlameLine[]> {
	return invoke<BlameLine[]>("git_blame", { root, path });
}
