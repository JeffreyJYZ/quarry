import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** The event the Rust watcher emits: one debounced batch of absolute paths inside the root. */
export const FS_CHANGED_EVENT = "fs://changed";

export type FsChangedEvent = { root: string; paths: string[] };

/** Start (or replace) the watcher for one project root. */
export function startWatch(root: string): Promise<void> {
	return invoke<void>("watch_start", { root });
}

/** Stop the watcher; safe when none is running. */
export function stopWatch(): Promise<void> {
	return invoke<void>("watch_stop");
}

/** Subscribe to changed-path batches. The resolved function unsubscribes. */
export function onFsChanged(handler: (event: FsChangedEvent) => void): Promise<() => void> {
	return listen<FsChangedEvent>(FS_CHANGED_EVENT, (event) => handler(event.payload));
}
