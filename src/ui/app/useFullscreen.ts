import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Whether the window is currently fullscreen.
 *
 * Reads the initial state once on mount and follows the window's resize events, since macOS
 * toggles fullscreen without a dedicated event we can rely on. Falls back to `false` outside
 * Tauri (plain browser, tests) instead of throwing.
 */
export function useFullscreen(): boolean {
	const [fullscreen, setFullscreen] = useState(false);

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;

		(async () => {
			try {
				const window = getCurrentWindow();
				const initial = await window.isFullscreen();
				if (!cancelled) setFullscreen(initial);

				const stop = await window.onResized(async () => {
					try {
						const value = await window.isFullscreen();
						if (!cancelled) setFullscreen(value);
					} catch {
						// Ignore transient failures; keep the last known state.
					}
				});
				if (cancelled) stop();
				else unlisten = stop;
			} catch {
				// Not running inside Tauri (or the API is unavailable): treat as windowed.
				if (!cancelled) setFullscreen(false);
			}
		})();

		return () => {
			cancelled = true;
			if (unlisten) unlisten();
		};
	}, []);

	return fullscreen;
}
