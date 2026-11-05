export type TerminalCursorStyle = "block" | "bar" | "underline";

import {
	DEFAULT_TERMINAL_PREFERENCES,
	TERMINAL_LETTER_SPACING_RANGE,
	TERMINAL_LINE_HEIGHT_RANGE,
	TERMINAL_SCROLLBACK_RANGE,
} from "@/lib/consts/terminal";

export {
	DEFAULT_TERMINAL_PREFERENCES,
	TERMINAL_CURSOR_STYLES,
	TERMINAL_LETTER_SPACING_RANGE,
	TERMINAL_LINE_HEIGHT_RANGE,
	TERMINAL_SCROLLBACK_RANGE,
} from "@/lib/consts/terminal";

export function clampLineHeight(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const rounded = Math.round(value * 10) / 10;
	return Math.min(
		TERMINAL_LINE_HEIGHT_RANGE.max,
		Math.max(TERMINAL_LINE_HEIGHT_RANGE.min, rounded),
	);
}

export function clampLetterSpacing(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(
		TERMINAL_LETTER_SPACING_RANGE.max,
		Math.max(TERMINAL_LETTER_SPACING_RANGE.min, Math.round(value)),
	);
}

export function clampScrollback(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(
		TERMINAL_SCROLLBACK_RANGE.max,
		Math.max(TERMINAL_SCROLLBACK_RANGE.min, Math.round(value)),
	);
}

export function normalizeTerminalPreferences(
	source: Record<string, unknown>,
	defaults: typeof DEFAULT_TERMINAL_PREFERENCES,
) {
	return {
		terminalLineHeight: clampLineHeight(source.terminalLineHeight, defaults.terminalLineHeight),
		terminalCursorStyle:
			source.terminalCursorStyle === "block" ||
			source.terminalCursorStyle === "bar" ||
			source.terminalCursorStyle === "underline"
				? (source.terminalCursorStyle as TerminalCursorStyle)
				: defaults.terminalCursorStyle,
		terminalCursorBlink:
			typeof source.terminalCursorBlink === "boolean"
				? source.terminalCursorBlink
				: defaults.terminalCursorBlink,
		terminalScrollback: clampScrollback(source.terminalScrollback, defaults.terminalScrollback),
		terminalLetterSpacing: clampLetterSpacing(
			source.terminalLetterSpacing,
			defaults.terminalLetterSpacing,
		),
	};
}

export function effectiveTerminalPreferences(user: {
	terminalLineHeight: number;
	terminalCursorStyle: TerminalCursorStyle;
	terminalCursorBlink: boolean;
	terminalScrollback: number;
	terminalLetterSpacing: number;
}) {
	return {
		terminalLineHeight: user.terminalLineHeight,
		terminalCursorStyle: user.terminalCursorStyle,
		terminalCursorBlink: user.terminalCursorBlink,
		terminalScrollback: user.terminalScrollback,
		terminalLetterSpacing: user.terminalLetterSpacing,
	};
}
