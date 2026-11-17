import { invoke } from "@tauri-apps/api/core";

/**
 * Opens another window of the same frontend.
 *
 * One process, one set of managed states: the new window loads the same app and shares the
 * language servers, debugger, terminals and run jobs the first one started. The backend answers the
 * label it gave the window, which is only useful for logging today.
 */
export function newWindow(): Promise<string> {
	return invoke<string>("new_window");
}
