import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

import { MENU_COMMAND_IDS } from "@/lib/consts/app";

export { MENU_COMMAND_IDS } from "@/lib/consts/app";

export function isMenuCommand(id: string): boolean {
	return MENU_COMMAND_IDS.has(id);
}

export function useNativeMenu(dispatch: (id: string) => void): void {
	const dispatchRef = useRef(dispatch);
	dispatchRef.current = dispatch;
	useEffect(() => {
		let unlisten: (() => void) | undefined;
		let cancelled = false;
		listen<string>("menu-command", (event) => {
			const id = event.payload;
			if (isMenuCommand(id)) {
				dispatchRef.current(id);
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
	}, []);
}
