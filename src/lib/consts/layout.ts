/** Panel geometry defaults and limits; `layout/model` clamps every value read from disk to these. */

import type { PanelName, PanelSizes } from "@/lib/layout/model";

export const DEFAULT_PANEL_SIZES: PanelSizes = {
	railWidth: 240,
	dockHeight: 260,
	terminalHeight: 180,
	terminalWidth: 380,
	outlineHeight: 200,
};

export const PANEL_LIMITS: Record<PanelName, { min: number; max: number }> = {
	railWidth: { min: 160, max: 560 },
	dockHeight: { min: 120, max: 900 },
	terminalHeight: { min: 100, max: 900 },
	terminalWidth: { min: 240, max: 900 },
	outlineHeight: { min: 80, max: 600 },
};

/** Keyboard steps for a separator: a small nudge, and a page-sized jump with Shift. */
export const PANEL_STEP = 8;
export const PANEL_STEP_LARGE = 32;
