import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export const MENU_COMMAND_IDS: ReadonlySet<string> = new Set([
	"check-updates",
	"open-settings",
	"new-project",
	"open-project",
	"save",
	"save-all",
	"find-in-project",
	"quick-open",
	"toggle-rail",
	"toggle-dock",
	"toggle-terminal",
	"toggle-source-control",
	"toggle-debug",
	"toggle-blame",
	"show-shortcuts",
	"build",
	"run",
	"stop-run",
	"run-to-cursor",
	"refresh-git",
	"reveal-active-file",
]);

export function isMenuCommand(id: string): boolean {
	return MENU_COMMAND_IDS.has(id);
}

export function useNativeMenu(dispatch: (id: string) => void): void {
	useEffect(() => {
		let unlisten: (() => void) | undefined;
		let cancelled = false;
		listen<string>("menu-command", (event) => {
			const id = event.payload;
			if (isMenuCommand(id)) {
				dispatch(id);
			}
		}).then((fn) => {
			if (cancelled) {
				fn();
			} else {
				unlisten = fn;
			}
		});
		return () => {
			cancelled = true;
			if (unlisten) {
				unlisten();
			}
		};
	}, [dispatch]);
}
