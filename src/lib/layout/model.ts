/**
 * Panel geometry for the three resizable edges: the rail and the two stacked
 * regions in the canvas.
 *
 * Sizes live in user settings, so every value that arrives from disk is clamped here first — a
 * hand-edited file must never produce a zero-width rail or a dock taller than the window.
 */

import { DEFAULT_PANEL_SIZES, PANEL_LIMITS } from "@/lib/consts/layout";

export type PanelSizes = {
	railWidth: number;
	dockHeight: number;
	terminalHeight: number;
	terminalWidth: number;
	/** Height of the outline under the file tree, so a long file list cannot swallow it. */
	outlineHeight: number;
	/** Width of the assembly split beside the editor. */
	disasmWidth: number;
};

export type PanelName = keyof PanelSizes;

export {
	DEFAULT_PANEL_SIZES,
	PANEL_LIMITS,
	PANEL_STEP,
	PANEL_STEP_LARGE,
} from "@/lib/consts/layout";

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
		dockHeight: read("dockHeight"),
		terminalHeight: read("terminalHeight"),
		terminalWidth: read("terminalWidth"),
		outlineHeight: read("outlineHeight"),
		disasmWidth: read("disasmWidth"),
	};
}

/** One panel moved to `px`, clamped; the other three are untouched. */
export function resizePanel(sizes: PanelSizes, name: PanelName, px: number): PanelSizes {
	return { ...sizes, [name]: clampPanel(name, px) };
}
