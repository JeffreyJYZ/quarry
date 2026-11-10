import { invoke } from "@tauri-apps/api/core";
import type { Bookmark } from "@/lib/bookmarks/model";

/** Every bookmark in the project; a stale one is dropped by the backend, not reported. */
export function listBookmarks(root: string): Promise<Bookmark[]> {
	return invoke<Bookmark[]>("list_bookmarks", { root });
}

/** Adds the bookmark at `line` when absent and removes it when present, returning the new set. */
export function toggleBookmark(root: string, path: string, line: number): Promise<Bookmark[]> {
	return invoke<Bookmark[]>("toggle_bookmark", { root, path, line });
}

/** Forgets every bookmark in the project. */
export function clearBookmarks(root: string): Promise<void> {
	return invoke<void>("clear_bookmarks", { root });
}
