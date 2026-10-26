import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import { ptyResize } from "@/lib/project/api";
import { DEFAULT_PREFERENCES } from "@/lib/settings/model";
import type { TerminalCursorStyle } from "@/lib/settings/terminal";
import {
	applyXtermAppearance,
	type XtermAppearance,
	xtermOptions,
} from "@/ui/terminal/xtermOptions";

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
	lineHeight?: number;
	letterSpacing?: number;
	cursorStyle?: TerminalCursorStyle;
	cursorBlink?: boolean;
	scrollback?: number;
	onData: (data: string) => void;
}): XtermHandle {
	const {
		hostRef,
		ptyId,
		fontSize,
		fontFamily,
		lineHeight = DEFAULT_PREFERENCES.terminalLineHeight,
		letterSpacing = DEFAULT_PREFERENCES.terminalLetterSpacing,
		cursorStyle = DEFAULT_PREFERENCES.terminalCursorStyle,
		cursorBlink = DEFAULT_PREFERENCES.terminalCursorBlink,
		scrollback = DEFAULT_PREFERENCES.terminalScrollback,
		onData,
	} = options;
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const ptyIdRef = useRef<string | null>(null);
	const timer = useRef<number | null>(null);
	const onDataRef = useRef(onData);
	const appearanceRef = useRef<XtermAppearance>({
		fontFamily,
		fontSize,
		lineHeight,
		letterSpacing,
		cursorStyle,
		cursorBlink,
		scrollback,
	});
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

	// A live change to the appearance moves the grid, so the fit has to be re-run by hand.
	useEffect(() => {
		const next = {
			fontFamily,
			fontSize,
			lineHeight,
			letterSpacing,
			cursorStyle,
			cursorBlink,
			scrollback,
		};
		appearanceRef.current = next;
		const term = termRef.current;
		if (term === null) return;
		applyXtermAppearance(term, next);
		scheduleSize();
	}, [
		fontFamily,
		fontSize,
		lineHeight,
		letterSpacing,
		cursorStyle,
		cursorBlink,
		scrollback,
		scheduleSize,
	]);

	// One emulator per PTY: a new tab is a new shell, and a restart swaps the emulator with it.
	useEffect(() => {
		ptyIdRef.current = ptyId;
		const host = hostRef.current;
		if (ptyId === null || host === null) return;
		const term = new Terminal(xtermOptions(appearanceRef.current));
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
