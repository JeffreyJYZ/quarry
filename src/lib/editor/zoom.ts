import { FONT_SIZE_RANGE } from "@/lib/consts/settings";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/settings/model";
import { stepValue } from "@/lib/settings/step";

/**
 * One step of the editor font, or the default when the step is zero.
 *
 * Zoom writes the same preference the settings stepper does, through the same `setPreferences`
 * setter and the same `stepValue` arithmetic, so Cmd+= and the stepper cannot disagree and a zoom
 * survives the next launch without its own storage.
 */
export function zoomPreferences(current: Preferences, delta: number): Preferences {
	const next =
		delta === 0
			? DEFAULT_PREFERENCES.editorFontSize
			: stepValue(
					current.editorFontSize,
					delta,
					FONT_SIZE_RANGE.min,
					FONT_SIZE_RANGE.max,
					current.editorFontSize,
				);
	return next === current.editorFontSize ? current : { ...current, editorFontSize: next };
}
