import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import { ptyResize } from "@/lib/project/api";
import { xtermFontFamily, xtermOptions } from "@/ui/terminal/xtermOptions";

/** A drag fires a stream of resize observations; the shell hears about the settled size once. */
const RESIZE_DEBOUNCE_MS = 120;

export type XtermHandle = {
	/** Raw PTY bytes. A chunk that beats the emulator is held and flushed once it exists. */
	write: (data: string) => void;
	focus: () => void;
};

/**
 * A real VT emulator for one PTY, drawn into `hostRef`.
 *
 * The line-based renderer could not survive a prompt that repaints itself with carriage returns and
 * cursor addressing, so the bytes go to xterm and it owns the grid, the selection and the scrollback.
 */
export function useXterm(options: {
	hostRef: React.RefObject<HTMLDivElement | null>;
	ptyId: string | null;
	fontSize: number;
	fontFamily: string;
	onData: (data: string) => void;
}): XtermHandle {
	const { hostRef, ptyId, fontSize, fontFamily, onData } = options;
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const ptyIdRef = useRef<string | null>(null);
	const timer = useRef<number | null>(null);
	const onDataRef = useRef(onData);
	const font = useRef({ family: fontFamily, size: fontSize });
	/** Output that arrives between the PTY id landing and the emulator being mounted. */
	const pending = useRef("");

	// The grid follows the host box, and the shell follows the grid.
	const applySize = useCallback(() => {
		const term = termRef.current;
		if (term === null) return;
		try {
			fitRef.current?.fit();
		} catch {
			// A hidden or zero-width host cannot be measured; the next observation tries again.
			return;
		}
		const id = ptyIdRef.current;
		if (id !== null) void ptyResize(id, term.rows, term.cols).catch(() => undefined);
	}, []);

	const scheduleSize = useCallback(() => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			timer.current = null;
			applySize();
		}, RESIZE_DEBOUNCE_MS);
	}, [applySize]);

	useEffect(() => {
		onDataRef.current = onData;
	}, [onData]);

	// A font change moves the grid without resizing the host, so the fit has to be re-run by hand.
	useEffect(() => {
		font.current = { family: fontFamily, size: fontSize };
		const term = termRef.current;
		if (term === null) return;
		const family = xtermFontFamily(fontFamily);
		if (term.options.fontFamily !== family) term.options.fontFamily = family;
		if (term.options.fontSize !== fontSize) term.options.fontSize = fontSize;
		scheduleSize();
	}, [fontFamily, fontSize, scheduleSize]);

	// One emulator per PTY: a new tab is a new shell, and a restart swaps the emulator with it.
	useEffect(() => {
		ptyIdRef.current = ptyId;
		const host = hostRef.current;
		if (ptyId === null || host === null) return;
		const term = new Terminal(xtermOptions(font.current.family, font.current.size));
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(host);
		const data = term.onData((chunk) => onDataRef.current(chunk));
		termRef.current = term;
		fitRef.current = fit;
		applySize();
		if (pending.current !== "") {
			const early = pending.current;
			pending.current = "";
			term.write(early);
		}
		const observer = new ResizeObserver(() => scheduleSize());
		observer.observe(host);
		return () => {
			observer.disconnect();
			if (timer.current !== null) {
				window.clearTimeout(timer.current);
				timer.current = null;
			}
			data.dispose();
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, [hostRef, ptyId, applySize, scheduleSize]);

	const write = useCallback((data: string) => {
		const term = termRef.current;
		if (term === null) {
			pending.current += data;
			return;
		}
		term.write(data);
	}, []);

	const focus = useCallback(() => {
		termRef.current?.focus();
	}, []);

	return { write, focus };
}
