/**
 * Terminal sizes and limits, from the font the panel clamps to the scrollback the PTY keeps.
 *
 * The panel, the settings page and the xterm options all read these, so a limit can only change in
 * one place.
 */

import type { TerminalCursorStyle } from "@/lib/settings/terminal";

export const TERMINAL_CURSOR_STYLES: TerminalCursorStyle[] = ["block", "bar", "underline"];
export const TERMINAL_LINE_HEIGHT_RANGE = { min: 1, max: 2 } as const;
export const TERMINAL_LETTER_SPACING_RANGE = { min: -2, max: 4 } as const;
export const TERMINAL_SCROLLBACK_RANGE = { min: 500, max: 50000 } as const;

export const DEFAULT_TERMINAL_PREFERENCES = {
	terminalLineHeight: 1.2,
	terminalCursorStyle: "block" as TerminalCursorStyle,
	terminalCursorBlink: true,
	terminalScrollback: 5000,
	terminalLetterSpacing: 0,
};

export const DEFAULT_FONT_SIZE = 11.5;
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 20;
export const FONT_STEP = 1;

/** Scrollback cap; older lines are dropped and counted. */
export const MAX_LINES = 4000;

/** A chatty shell may emit faster than the handshake completes; keep the newest output. */
export const MAX_CHUNKS = 64;
export const MAX_CHARS = 64 * 1024;

/** Abandoned ids are never claimed again, so the map itself is capped too. */
export const MAX_IDS = 8;

/** The app token `--mono`, repeated because a canvas cannot inherit a CSS variable. */
export const MONO_STACK = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

export const SCROLLBACK = 5000;
