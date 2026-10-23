import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PtyOutputEvent = { id: string; data: string };
export type PtyExitedEvent = { id: string; code: number | null };
export type PtyOpenResult = { id: string; pid: number | null };

export function ptyOpen(cwd: string, rows: number, cols: number): Promise<PtyOpenResult> {
	return invoke<PtyOpenResult>("pty_open", { cwd, rows, cols });
}

export function ptyWrite(id: string, data: string): Promise<void> {
	return invoke<void>("pty_write", { id, data });
}

export function ptyResize(id: string, rows: number, cols: number): Promise<void> {
	return invoke<void>("pty_resize", { id, rows, cols });
}

export function ptyClose(id: string): Promise<void> {
	return invoke<void>("pty_close", { id });
}

export function onPtyOutput(handler: (event: PtyOutputEvent) => void): Promise<() => void> {
	return listen<PtyOutputEvent>("pty://output", (event) => handler(event.payload));
}

export function onPtyExited(handler: (event: PtyExitedEvent) => void): Promise<() => void> {
	return listen<PtyExitedEvent>("pty://exited", (event) => handler(event.payload));
}
