import { DEFAULT_PREFERENCES, type Preferences, clampFontSize } from "@/lib/settings/model";

/**
 * One step of the editor font, or the default when the step is zero.
 *
 * Zoom writes the same preference the settings page shows, so Cmd+= and the stepper cannot disagree
 * and a zoom survives the next launch without its own storage.
 */
export function zoomPreferences(current: Preferences, delta: number): Preferences {
	const next =
		delta === 0
			? DEFAULT_PREFERENCES.editorFontSize
			: clampFontSize(current.editorFontSize + delta, current.editorFontSize);
	return next === current.editorFontSize ? current : { ...current, editorFontSize: next };
}
