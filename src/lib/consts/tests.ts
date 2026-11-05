/** The dock's tabs in display order, and the glyph and cap the run and test panels share. */

import type { DockTab } from "@/ui/tests/parts";

/** Every tab in order; a stored value is validated against this list, not a second copy of it. */
export const DOCK_TABS: DockTab[] = ["problems", "tests", "run", "debugger", "console", "memory"];

export const OUTPUT_LINE_CAP = 200;
export const RUNNING_GLYPH = "◦";
