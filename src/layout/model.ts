/**
 * Panel geometry for the three resizable edges: the rail, the debug panel and the two stacked
 * regions in the canvas.
 *
 * Sizes live in user settings, so every value that arrives from disk is clamped here first — a
 * hand-edited file must never produce a zero-width rail or a dock taller than the window.
 */

export type PanelSizes = {
	railWidth: number;
	debugWidth: number;
	dockHeight: number;
	terminalHeight: number;
	terminalWidth: number;
};

export type PanelName = keyof PanelSizes;

export const DEFAULT_PANEL_SIZES: PanelSizes = {
	railWidth: 240,
	debugWidth: 320,
	dockHeight: 260,
	terminalHeight: 180,
	terminalWidth: 380,
};

export const PANEL_LIMITS: Record<PanelName, { min: number; max: number }> = {
	railWidth: { min: 160, max: 560 },
	debugWidth: { min: 200, max: 640 },
	dockHeight: { min: 120, max: 900 },
	terminalHeight: { min: 100, max: 900 },
	terminalWidth: { min: 240, max: 900 },
};

export function clampPanel(name: PanelName, value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_PANEL_SIZES[name];
	const { min, max } = PANEL_LIMITS[name];
	return Math.round(Math.min(max, Math.max(min, value)));
}

/** Every panel clamped, with a missing or unusable entry replaced by its default. */
export function clampPanelSizes(input: unknown): PanelSizes {
	const source = (typeof input === "object" && input !== null ? input : {}) as Record<
		string,
		unknown
	>;
	const read = (name: PanelName): number => {
		const value = source[name];
		return typeof value === "number" ? clampPanel(name, value) : DEFAULT_PANEL_SIZES[name];
	};
	return {
		railWidth: read("railWidth"),
		debugWidth: read("debugWidth"),
		dockHeight: read("dockHeight"),
		terminalHeight: read("terminalHeight"),
		terminalWidth: read("terminalWidth"),
	};
}

/** One panel moved to `px`, clamped; the other three are untouched. */
export function resizePanel(sizes: PanelSizes, name: PanelName, px: number): PanelSizes {
	return { ...sizes, [name]: clampPanel(name, px) };
}

/** Keyboard steps for a separator: a small nudge, and a page-sized jump with Shift. */
export const PANEL_STEP = 8;
export const PANEL_STEP_LARGE = 32;
