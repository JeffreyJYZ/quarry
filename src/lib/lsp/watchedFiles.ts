import { invoke } from "@tauri-apps/api/core";

/** LSP `FileChangeType.Created`. */
export const FILE_CHANGE_CREATED = 1;
/** LSP `FileChangeType.Changed`. */
export const FILE_CHANGE_CHANGED = 2;
/** LSP `FileChangeType.Deleted`. */
export const FILE_CHANGE_DELETED = 3;

/** LSP `FileChangeType`: what the watcher saw happen to a path. */
export type FileChangeKind =
	typeof FILE_CHANGE_CREATED | typeof FILE_CHANGE_CHANGED | typeof FILE_CHANGE_DELETED;
export type WatchedFileChange = { path: string; kind: FileChangeKind };

/**
 * Tell one server that files changed on disk.
 *
 * The editor already sends `didChange` for its own edits; this covers everything else — a
 * `git checkout`, an external formatter, a file created in another app — so the server re-reads
 * instead of analysing text that is no longer on disk.
 */
export function notifyWatchedFiles(session: string, changes: WatchedFileChange[]): Promise<void> {
	return invoke<void>("lsp_watched_files", { root: session, changes });
}
