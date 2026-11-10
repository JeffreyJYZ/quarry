import { useEffect } from "react";
import type { TestMarker } from "@/lib/tests/gutter";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";
import { setTestMarkers, testGutter } from "@/ui/tests/testGutter";

/**
 * Pushes the shell's test markers into the view.
 *
 * The column is mounted only while there is a marker to draw, which is why the compartment is
 * reconfigured as well as the field written; a file with no tests keeps no empty gutter column.
 */
export function useTestGutter(refs: EditorRefs, markers: readonly TestMarker[]): void {
	const { viewRef, testGutterRef, testMarkersRef, onTestMarkerRef } = refs;
	useEffect(() => {
		const view = viewRef.current;
		const compartment = testGutterRef.current;
		if (view === null || compartment === null) return;
		const enabled = markers.length > 0;
		const events = markers
			.map((marker) => `${marker.line}:${marker.kind}:${marker.state}:${marker.name}`)
			.join("|");
		const signature = `${enabled ? "on" : "off"}:${events}`;
		if (signature === testMarkersRef.current) return;
		const wasEnabled = testMarkersRef.current.startsWith("on");
		testMarkersRef.current = signature;
		if (!enabled) {
			if (wasEnabled) view.dispatch({ effects: compartment.reconfigure([]) });
			return;
		}
		if (!wasEnabled) {
			view.dispatch({
				effects: compartment.reconfigure(
					testGutter((marker, group) => onTestMarkerRef.current?.(marker, group)),
				),
			});
		}
		view.dispatch({ effects: setTestMarkers.of(markers) });
	}, [markers, viewRef, testGutterRef, testMarkersRef, onTestMarkerRef]);
}
