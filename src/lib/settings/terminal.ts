export type TerminalCursorStyle = "block" | "bar" | "underline";
export const TERMINAL_CURSOR_STYLES: TerminalCursorStyle[] = ["block", "bar", "underline"];
export const TERMINAL_LINE_HEIGHT_RANGE = { min: 1, max: 2 } as const;
export const TERMINAL_LETTER_SPACING_RANGE = { min: -2, max: 4 } as const;
export const TERMINAL_SCROLLBACK_RANGE = { min: 500, max: 50000 } as const;

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

export const DEFAULT_TERMINAL_PREFERENCES = {
	terminalLineHeight: 1.2,
	terminalCursorStyle: "block" as TerminalCursorStyle,
	terminalCursorBlink: true,
	terminalScrollback: 5000,
	terminalLetterSpacing: 0,
};

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
